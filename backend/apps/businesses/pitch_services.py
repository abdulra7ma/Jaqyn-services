"""Prospect pitch-link services.

A founder pre-creates a PENDING business in admin, generates a single-use pitch
link, and DMs it to the owner. The owner resolves the link (sees their branded
card), requests a 6-digit email code, and claims the business — which attaches
them as owner, starts onboarding, and returns JWTs. Token security and email-OTP
mechanics reuse the existing owner-invite and account-OTP infrastructure.
"""
from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.accounts.tasks import send_email_otp_task
from apps.businesses.models import Business, BusinessNote, PitchInvite
from apps.businesses.onboarding_services import hash_token
from apps.businesses.services import add_business_note
from core.exceptions import JaqynAPIException
from core.logging import emit_event
from core.ratelimit import hit_limit

# A pitch link lives for a full sales cycle, not a security window — 30 days.
PITCH_INVITE_TTL_DAYS = 30
# Max wrong code entries before the code is burned (mirrors email-OTP's limit).
PITCH_OTP_MAX_ATTEMPTS = 5

# Category -> (default stamp goal, reward noun). The founder pre-picks a sensible
# program so the card is never empty; the prospect can edit it on the page.
# Sourced from the sales playbook's per-vertical defaults.
_CATEGORY_DEFAULTS: dict[str, tuple[int, str]] = {
    Business.Category.CAFE: (5, "кофе"),
    Business.Category.RESTAURANT: (6, "блюдо"),
    Business.Category.BARBER: (5, "стрижка"),
    Business.Category.BEAUTY: (5, "услуга"),
    Business.Category.BAKERY: (6, "выпечка"),
    Business.Category.RETAIL: (6, "покупка"),
    Business.Category.OTHER: (6, "награда"),
}
_DEFAULT_PROGRAM = (6, "награда")


@dataclass
class PitchView:
    business_id: str
    business_name: str
    logo_path: str | None  # storage path; the view builds the absolute URL
    category: str
    default_goal: int
    default_reward: str
    published_count: int


@dataclass
class ClaimResult:
    user: User
    business: Business
    access: str
    refresh: str


def _pitch_otp_key(raw: str) -> str:
    # Keyed by token hash (not email) so one link owns one code, isolated from
    # the signup email-OTP namespace (`email_otp:`).
    return f"pitch_otp:{hash_token(raw)}"


def _pitch_otp_attempt_key(raw: str) -> str:
    # Wrong-attempt counter for this link's code, in the same hash-keyed pitch
    # namespace as _pitch_otp_key; burns the code once PITCH_OTP_MAX_ATTEMPTS is hit.
    return f"pitch_otp_attempts:{hash_token(raw)}"


def generate_pitch_invite(
    business: Business, ttl_days: int = PITCH_INVITE_TTL_DAYS
) -> tuple[PitchInvite, str]:
    """Mint a single-use pitch invite for `business`. Returns (invite, raw_token).

    Only sha256(raw) is stored; the raw token is returned once for the URL and
    never persisted. Any existing unexpired-unclaimed invite for the business
    should be expired by the caller first (admin enforces one active link).
    """
    raw = secrets.token_urlsafe(32)
    invite = PitchInvite.objects.create(
        business=business,
        token_hash=hash_token(raw),
        expires_at=timezone.now() + timedelta(days=ttl_days),
    )
    emit_event("pitch_created", business_id=str(business.id), invite_id=str(invite.id))
    return invite, raw


def _load_claimable(raw: str) -> PitchInvite:
    """Fetch an invite by raw token and assert it can still be used.

    Raises PITCH_NOT_FOUND (404) if unknown, PITCH_GONE (410) if claimed or
    expired. Marks a past-due PENDING/OPENED invite EXPIRED on the way through.
    """
    invite = (
        PitchInvite.objects.filter(token_hash=hash_token(raw))
        .select_related("business")
        .first()
    )
    if invite is None:
        raise JaqynAPIException("PITCH_NOT_FOUND", "Ссылка не найдена", status.HTTP_404_NOT_FOUND)
    if invite.status == PitchInvite.Status.CLAIMED:
        raise JaqynAPIException("PITCH_GONE", "Ссылка больше не активна", status.HTTP_410_GONE)
    if invite.expires_at < timezone.now():
        if invite.status != PitchInvite.Status.EXPIRED:
            invite.status = PitchInvite.Status.EXPIRED
            invite.save(update_fields=["status", "updated_at"])
        raise JaqynAPIException("PITCH_GONE", "Ссылка больше не активна", status.HTTP_410_GONE)
    return invite


def resolve_pitch(raw_token: str) -> tuple[PitchInvite, PitchView]:
    """Resolve a pitch link into its display view; flip PENDING->OPENED once.

    Idempotent for repeat opens (stays OPENED, no duplicate event). Raises for
    unknown/claimed/expired links (see _load_claimable).
    """
    invite = _load_claimable(raw_token)
    business = invite.business
    if invite.status == PitchInvite.Status.PENDING:
        invite.status = PitchInvite.Status.OPENED
        invite.opened_at = timezone.now()
        invite.save(update_fields=["status", "opened_at", "updated_at"])
        emit_event("pitch_opened", business_id=str(business.id), invite_id=str(invite.id))
    goal, reward = _CATEGORY_DEFAULTS.get(business.category, _DEFAULT_PROGRAM)
    # Social proof: how many businesses are live. APPROVED is the launched set.
    published_count = Business.objects.filter(status=Business.Status.APPROVED).count()
    view = PitchView(
        business_id=str(business.id),
        business_name=business.name,
        logo_path=business.logo.url if business.logo else None,
        category=business.category,
        default_goal=goal,
        default_reward=reward,
        published_count=published_count,
    )
    return invite, view


def request_pitch_code(raw_token: str, email: str, ip_address: str | None) -> None:
    """Issue a 6-digit code for claiming this pitch link, emailed to `email`.

    Validates the link is still claimable, rate-limits per link and per IP
    (reusing the account OTP limits), caches the code under the link's namespace,
    and dispatches the email on commit. Raises RATE_LIMITED (429) when over limit.
    """
    invite = _load_claimable(raw_token)
    email = email.lower()
    if hit_limit(f"pitch-otp:{hash_token(raw_token)}", settings.OTP_RATE_LIMIT_PER_PHONE, 3600):
        raise JaqynAPIException("RATE_LIMITED", "Слишком много попыток", status.HTTP_429_TOO_MANY_REQUESTS)
    if ip_address and hit_limit(f"pitch-otp-ip:{ip_address}", settings.OTP_RATE_LIMIT_PER_IP, 3600):
        raise JaqynAPIException("RATE_LIMITED", "Слишком много попыток", status.HTTP_429_TOO_MANY_REQUESTS)
    code = f"{secrets.randbelow(1000000):06d}"  # 6-digit, zero-padded
    cache.set(_pitch_otp_key(raw_token), {"code": code, "email": email}, settings.OTP_TTL_SECONDS)
    cache.delete(_pitch_otp_attempt_key(raw_token))
    transaction.on_commit(lambda: send_email_otp_task.delay(email, code))
    emit_event(
        "pitch_code_requested",
        business_id=str(invite.business_id),
        token_hash=hash_token(raw_token),
    )


def claim_pitch(
    raw_token: str, email: str, code: str, goal: int, reward_text: str
) -> ClaimResult:
    """Verify the code and claim the business for the prospect.

    Under a row lock on the invite: validate the code (expiry + attempt limit),
    get-or-create the user as BUSINESS_OWNER (unusable password — set later),
    attach them as owner, move onboarding to IN_PROGRESS, record the chosen
    program + a STATUS_CHANGE note, and mark the invite CLAIMED. Returns JWTs.
    Raises OTP_EXPIRED/INVALID_OTP/RATE_LIMITED (400/429), PITCH_GONE (410) on a
    re-claim, and PITCH_OWNER_EXISTS (409) if the email already owns a business.
    """
    email = email.lower()
    with transaction.atomic():
        invite = (
            PitchInvite.objects.select_for_update()
            .select_related("business")
            .filter(token_hash=hash_token(raw_token))
            .first()
        )
        if invite is None:
            raise JaqynAPIException("PITCH_NOT_FOUND", "Ссылка не найдена", status.HTTP_404_NOT_FOUND)
        if invite.status == PitchInvite.Status.CLAIMED:
            raise JaqynAPIException("PITCH_GONE", "Ссылка больше не активна", status.HTTP_410_GONE)
        if invite.expires_at < timezone.now():
            invite.status = PitchInvite.Status.EXPIRED
            invite.save(update_fields=["status", "updated_at"])
            raise JaqynAPIException("PITCH_GONE", "Ссылка больше не активна", status.HTTP_410_GONE)

        payload = cache.get(_pitch_otp_key(raw_token))
        if not payload:
            raise JaqynAPIException("OTP_EXPIRED", "Код истёк", status.HTTP_400_BAD_REQUEST)
        attempts = cache.get(_pitch_otp_attempt_key(raw_token), 0) + 1
        cache.set(_pitch_otp_attempt_key(raw_token), attempts, settings.OTP_TTL_SECONDS)
        if attempts > PITCH_OTP_MAX_ATTEMPTS:
            raise JaqynAPIException("RATE_LIMITED", "Слишком много попыток", status.HTTP_429_TOO_MANY_REQUESTS)
        if payload["code"] != code:
            raise JaqynAPIException("INVALID_OTP", "Неверный код", status.HTTP_400_BAD_REQUEST)
        # Bind the OTP to the email it was mailed to. Without this, an attacker
        # holding the link could request a code to their own address, then verify
        # with a victim's email — taking over that account. Both sides are lowercased.
        if payload["email"] != email:
            raise JaqynAPIException("INVALID_OTP", "Неверный код", status.HTTP_400_BAD_REQUEST)

        business = invite.business
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            # phone is the unique USERNAME_FIELD; synthesize a placeholder for an
            # email-only owner (same trick as activate_owner). No usable password
            # until they set one during onboarding.
            user = User(
                phone=f"owner-{uuid.uuid4().hex[:12]}",
                email=email,
                role=User.Role.BUSINESS_OWNER,
            )
            user.set_unusable_password()
            user.is_email_verified = True
            user.save()
        elif getattr(user, "owned_business", None) is not None:
            raise JaqynAPIException(
                "PITCH_OWNER_EXISTS", "Этот email уже владеет бизнесом", status.HTTP_409_CONFLICT
            )
        else:
            user.role = User.Role.BUSINESS_OWNER
            user.is_email_verified = True
            user.save(update_fields=["role", "is_email_verified", "updated_at"])

        business.owner = user
        if business.onboarding_status == Business.OnboardingStatus.NOT_STARTED:
            business.onboarding_status = Business.OnboardingStatus.IN_PROGRESS
        business.save(update_fields=["owner", "onboarding_status", "updated_at"])

        # Begin the trial exactly as admin approval does (idempotent).
        from apps.businesses.trial_services import start_trial

        start_trial(business)

        invite.status = PitchInvite.Status.CLAIMED
        invite.claimed_at = timezone.now()
        invite.claimed_email = email
        invite.chosen_goal = goal
        invite.chosen_reward_text = reward_text
        invite.save(update_fields=[
            "status", "claimed_at", "claimed_email",
            "chosen_goal", "chosen_reward_text", "updated_at",
        ])
        add_business_note(
            business,
            body=f"Бизнес забран через pitch-ссылку ({email})",
            kind=BusinessNote.Kind.STATUS_CHANGE,
        )

    cache.delete(_pitch_otp_key(raw_token))
    cache.delete(_pitch_otp_attempt_key(raw_token))
    emit_event("pitch_claimed", business_id=str(business.id), user_id=str(user.id))
    refresh = RefreshToken.for_user(user)
    return ClaimResult(user=user, business=business, access=str(refresh.access_token), refresh=str(refresh))
