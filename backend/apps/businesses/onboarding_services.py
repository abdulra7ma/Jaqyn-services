"""Onboarding, owner-invite activation, and verification workflow services.

Token security: only the SHA-256 hash of an invite token is stored; the raw token
is returned once (to be embedded in the activation link) and never persisted.
"""
import hashlib
import secrets
import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.businesses.models import Business, BusinessOwnerInvite, StaffInvite
from core.exceptions import JaqynAPIException
from core.logging import emit_event

OWNER_INVITE_TTL_DAYS = 5
STAFF_LIMIT = 5


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def generate_owner_invite(business, email=None, phone=None, ttl_days=OWNER_INVITE_TTL_DAYS):
    """Create a single-use owner invite. Returns (invite, raw_token)."""
    raw = secrets.token_urlsafe(32)
    invite = BusinessOwnerInvite.objects.create(
        business=business,
        email=email,
        phone=phone,
        token_hash=hash_token(raw),
        expires_at=timezone.now() + timedelta(days=ttl_days),
    )
    emit_event("owner_invite_created", business_id=str(business.id), invite_id=str(invite.id))
    return invite, raw


def validate_owner_token(raw: str) -> BusinessOwnerInvite:
    invite = BusinessOwnerInvite.objects.filter(token_hash=hash_token(raw)).select_related("business").first()
    if invite is None:
        raise JaqynAPIException("INVITE_NOT_FOUND", "Invalid activation link", status.HTTP_404_NOT_FOUND)
    if invite.status != BusinessOwnerInvite.Status.PENDING:
        raise JaqynAPIException("INVITE_USED", "This invitation has already been used", status.HTTP_409_CONFLICT)
    if invite.expires_at < timezone.now():
        invite.status = BusinessOwnerInvite.Status.EXPIRED
        invite.save(update_fields=["status", "updated_at"])
        raise JaqynAPIException("INVITE_EXPIRED", "This invitation has expired", status.HTTP_410_GONE)
    return invite


@transaction.atomic
def activate_owner(raw: str, full_name: str, password: str):
    """Validate the token, create/attach the owner user, return (user, business, access, refresh)."""
    invite = validate_owner_token(raw)
    business = invite.business

    user = None
    if invite.email:
        user = User.objects.filter(email__iexact=invite.email).first()
    if user is None and invite.phone:
        user = User.objects.filter(phone=invite.phone).first()
    if user is None:
        # Owner accounts authenticate by email+password; phone is the unique
        # USERNAME_FIELD, so synthesize a placeholder when the invite is email-only.
        phone = invite.phone or f"owner-{uuid.uuid4().hex[:12]}"
        user = User(phone=phone, email=invite.email, role=User.Role.BUSINESS_OWNER)

    user.name = full_name
    user.role = User.Role.BUSINESS_OWNER
    if invite.email and not user.email:
        user.email = invite.email
    user.set_password(password)
    user.save()

    business.owner = user
    if business.onboarding_status == Business.OnboardingStatus.NOT_STARTED:
        business.onboarding_status = Business.OnboardingStatus.IN_PROGRESS
    business.save(update_fields=["owner", "onboarding_status", "updated_at"])

    invite.status = BusinessOwnerInvite.Status.ACCEPTED
    invite.accepted_at = timezone.now()
    invite.save(update_fields=["status", "accepted_at", "updated_at"])

    emit_event("owner_invite_activated", business_id=str(business.id), owner_id=str(user.id))
    refresh = RefreshToken.for_user(user)
    return user, business, str(refresh.access_token), str(refresh)


def required_fields(business) -> list[dict]:
    """The onboarding completion checklist driving the review screen."""
    has_type_items = business.catalog_items.filter(is_active=True).exists()
    return [
        {"label": "Business name", "ok": bool(business.name.strip()), "step": 1},
        {"label": "Description", "ok": bool((business.description or "").strip()), "step": 1},
        {"label": "Primary phone", "ok": bool((business.phone or "").strip()), "step": 1},
        {"label": "Address & map location", "ok": bool((business.address or "").strip()), "step": 1},
        {"label": "Logo image", "ok": business.logo_set or bool(business.logo), "step": 1},
        {"label": "Business type", "ok": bool(business.business_type), "step": 2},
        {"label": "Catalog (add at least one)", "ok": has_type_items, "step": 3},
    ]


def missing_required(business) -> list[dict]:
    return [{"label": r["label"], "step": r["step"]} for r in required_fields(business) if not r["ok"]]


def completion_score(business) -> int:
    fields = required_fields(business)
    return round(sum(1 for r in fields if r["ok"]) / len(fields) * 100)


def onboarding_state(business) -> dict:
    return {
        "business_id": str(business.id),
        "onboarding_status": business.onboarding_status,
        "verification_status": business.verification_status,
        "visibility_status": business.visibility_status,
        "completion_score": completion_score(business),
        "missing_required_fields": missing_required(business),
        "change_note": business.change_note,
    }


@transaction.atomic
def submit_onboarding(business):
    missing = missing_required(business)
    if missing:
        raise JaqynAPIException(
            "VALIDATION_ERROR",
            "Complete required fields before submitting",
            status.HTTP_400_BAD_REQUEST,
            details={m["label"]: ["Required"] for m in missing},
        )
    business.onboarding_status = Business.OnboardingStatus.SUBMITTED
    business.verification_status = Business.VerificationStatus.PENDING
    business.visibility_status = Business.VisibilityStatus.DRAFT
    business.submitted_at = timezone.now()
    business.change_note = ""
    business.save(
        update_fields=[
            "onboarding_status",
            "verification_status",
            "visibility_status",
            "submitted_at",
            "change_note",
            "updated_at",
        ]
    )
    emit_event("onboarding_submitted", business_id=str(business.id))
    return business


@transaction.atomic
def verify_business(business, publish=True):
    business.verification_status = Business.VerificationStatus.VERIFIED
    business.onboarding_status = Business.OnboardingStatus.COMPLETED
    business.verified_at = timezone.now()
    if publish:
        business.visibility_status = Business.VisibilityStatus.PUBLISHED
        business.status = Business.Status.APPROVED  # surfaces in customer discovery
        business.published_at = timezone.now()
    business.save()
    emit_event("business_verified", business_id=str(business.id))
    return business


@transaction.atomic
def request_changes(business, note=""):
    business.onboarding_status = Business.OnboardingStatus.CHANGES_REQUESTED
    business.verification_status = Business.VerificationStatus.PENDING
    business.change_note = note
    business.save(update_fields=["onboarding_status", "verification_status", "change_note", "updated_at"])
    emit_event("business_changes_requested", business_id=str(business.id))
    return business


def staff_invite_usage(business) -> int:
    return business.staff_invites.filter(
        status__in=[StaffInvite.Status.PENDING, StaffInvite.Status.ACCEPTED]
    ).count()


def can_add_staff(business) -> bool:
    return staff_invite_usage(business) < STAFF_LIMIT
