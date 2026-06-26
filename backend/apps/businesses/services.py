from dataclasses import dataclass
from typing import Optional

from django.core.files.uploadedfile import UploadedFile
from django.db import models, transaction
from rest_framework import status

from apps.accounts.models import User
from apps.businesses.models import Business, BusinessImage, BusinessNote, BusinessOwnerInvite, CatalogItem
from core.exceptions import JaqynAPIException
from core.images import COVER_MAX_DIM, GALLERY_MAX_DIM, LOGO_MAX_DIM, PRODUCT_MAX_DIM, compress_image
from core.logging import emit_event

# Maximum number of gallery images per business (business rule: keeps storage
# bounded; 8 gives enough visual variety without bloating the customer page).
GALLERY_LIMIT = 8


@dataclass(frozen=True)
class BusinessLeadData:
    """Typed input for a public landing-page lead submission."""

    name: str
    owner_name: str
    email: str
    phone: str
    category: str
    area: str
    instagram_url: str


@transaction.atomic
def register_business(owner: "User", data: dict) -> Business:
    """Register an authenticated user as a business owner and create a PENDING Business.

    Promotes the user to BUSINESS_OWNER role, creates the Business row with the
    provided data, and emits a registration event.
    Raises ConflictError (409) if the owner already has a business.
    Returns the created Business.
    """
    if hasattr(owner, "owned_business"):
        raise JaqynAPIException("VALIDATION_ERROR", "Owner already has a business", status.HTTP_409_CONFLICT)

    owner.role = User.Role.BUSINESS_OWNER
    owner.save(update_fields=["role", "updated_at"])
    business = Business.objects.create(owner=owner, **data)
    emit_event("business_registered", business_id=str(business.id), owner_id=str(owner.id))
    return business


# Landing-form category labels → Business.Category. The landing select offers
# human labels (src/i18n/content.ts CATEGORY_VALUES) that don't 1:1 match our
# choices: "Salon"→beauty, "Barbershop"→barber, "Boutique"→retail, and "Gym" has
# no dedicated choice so it maps to OTHER. Keyed by lowercased label so casing
# never matters. Anything unmapped falls back to OTHER.
_LANDING_CATEGORY_MAP = {
    "cafe": Business.Category.CAFE,
    "restaurant": Business.Category.RESTAURANT,
    "salon": Business.Category.BEAUTY,
    "barbershop": Business.Category.BARBER,
    "barber": Business.Category.BARBER,
    "beauty": Business.Category.BEAUTY,
    "bakery": Business.Category.BAKERY,
    "boutique": Business.Category.RETAIL,
    "retail": Business.Category.RETAIL,
    "gym": Business.Category.OTHER,
    "other": Business.Category.OTHER,
}


def register_business_lead(data: BusinessLeadData) -> Business:
    """Create a PENDING, owner-less Business from a public landing submission.

    Maps the landing payload onto Business fields, normalises category via
    _LANDING_CATEGORY_MAP to a Business.Category member (falls back to OTHER if
    the label is unknown), stores the prospective owner's name/email on
    pending_owner_*. No owner is attached — that happens at invite activation.
    Returns the created Business. Pure create; no side effects.
    """
    # Normalise the incoming category label to a valid Business.Category member.
    # Unrecognised values fall back to OTHER so we never store a free-form string
    # in a choices field (business rule: accept the submission, categorise safely).
    category = _LANDING_CATEGORY_MAP.get((data.category or "").strip().lower(), Business.Category.OTHER)

    business = Business.objects.create(
        name=data.name,
        category=category,
        phone=data.phone,
        area=data.area,
        instagram_url=data.instagram_url or "",
        pending_owner_name=data.owner_name,
        pending_owner_email=data.email,
        status=Business.Status.PENDING,
    )
    emit_event("business_lead_registered", business_id=str(business.id))
    return business


def add_business_note(
    business: Business,
    *,
    body: str,
    kind: str = BusinessNote.Kind.INTERNAL,
    author: Optional["User"] = None,
) -> BusinessNote:
    """Append one note to a business's onboarding/review thread.

    Snapshots the business's current ``status`` into ``status_at_note`` so the
    trail stays readable after later transitions. Returns the created note.
    """
    return BusinessNote.objects.create(
        business=business,
        author=author,
        kind=kind,
        body=body,
        status_at_note=business.status,
    )


@transaction.atomic
def approve_business(business: Business, admin_user: Optional["User"] = None) -> Business:
    """Approve a PENDING business and schedule the owner invite email if applicable.

    Sets status to APPROVED, records a STATUS_CHANGE note, emits events, then calls
    _send_owner_invite_if_needed to idempotently mint an owner invite and
    schedule the activation email via transaction.on_commit.
    Returns the updated Business.
    """
    business.status = Business.Status.APPROVED
    business.save(update_fields=["status", "updated_at"])
    add_business_note(
        business, body="Business approved", kind=BusinessNote.Kind.STATUS_CHANGE, author=admin_user
    )
    emit_event("business_approved", business_id=str(business.id))
    if admin_user:
        emit_event("admin_approved_business", business_id=str(business.id), admin_id=str(admin_user.id))
    _send_owner_invite_if_needed(business)
    return business


def _send_owner_invite_if_needed(business: Business) -> None:
    """Mint an owner invite and schedule the activation email — once.

    Guard: only when the business has NO owner yet AND a pending_owner_email AND no
    existing PENDING owner invite (idempotent: re-approving never re-sends). The
    email is dispatched via transaction.on_commit so the worker never reads a row
    the outer txn hasn't committed (backend.md Celery rule). The raw token is
    generated here (never stored) and handed to the task.
    """
    if business.owner_id is not None or not business.pending_owner_email:
        return
    if business.owner_invites.filter(status=BusinessOwnerInvite.Status.PENDING).exists():
        return

    from apps.businesses.onboarding_services import generate_owner_invite
    from apps.businesses.tasks import send_owner_invite_email

    invite, raw = generate_owner_invite(
        business,
        email=business.pending_owner_email,
    )
    # Schedule via on_commit so the Celery worker never tries to load a row
    # that the outer transaction hasn't committed yet (backend.md §Celery).
    transaction.on_commit(
        lambda: send_owner_invite_email.delay(str(invite.id), raw)
    )


@transaction.atomic
def reject_business(
    business: Business, admin_user: Optional["User"] = None, reason: Optional[str] = None
) -> Business:
    """Reject a business and record the reason on the review thread.

    Sets status to REJECTED and writes a STATUS_CHANGE note carrying the
    reviewer's reason (falls back to a generic line). Returns the business.
    """
    business.status = Business.Status.REJECTED
    business.save(update_fields=["status", "updated_at"])
    add_business_note(
        business,
        body=f"Business rejected: {reason}" if reason else "Business rejected",
        kind=BusinessNote.Kind.STATUS_CHANGE,
        author=admin_user,
    )
    emit_event("admin_rejected_business", business_id=str(business.id), admin_id=str(getattr(admin_user, "id", "")), reason=reason)
    return business


@transaction.atomic
def disable_business(business: Business, admin_user: Optional["User"] = None) -> Business:
    """Disable a business, deactivate its QR tokens, and log the transition.

    Sets status to DISABLED, deactivates every active QR token, and writes a
    STATUS_CHANGE note. Returns the business.
    """
    business.status = Business.Status.DISABLED
    business.save(update_fields=["status", "updated_at"])
    business.qr_tokens.filter(is_active=True).update(is_active=False)
    add_business_note(
        business, body="Business disabled", kind=BusinessNote.Kind.STATUS_CHANGE, author=admin_user
    )
    emit_event("admin_disabled_business", business_id=str(business.id), admin_id=str(getattr(admin_user, "id", "")))
    return business


@transaction.atomic
def request_business_changes(
    business: Business, admin_user: Optional["User"] = None, reason: str = ""
) -> Business:
    """Send an onboarding submission back to the owner for edits.

    Sets ``onboarding_status`` to CHANGES_REQUESTED and writes a
    CHANGES_REQUESTED note carrying the reviewer's feedback (the note kind owners
    are allowed to see). Emits ``admin_requested_changes``. Returns the business.
    """
    business.onboarding_status = Business.OnboardingStatus.CHANGES_REQUESTED
    business.save(update_fields=["onboarding_status", "updated_at"])
    add_business_note(
        business,
        body=reason or "Changes requested",
        kind=BusinessNote.Kind.CHANGES_REQUESTED,
        author=admin_user,
    )
    emit_event("admin_requested_changes", business_id=str(business.id), admin_id=str(getattr(admin_user, "id", "")))
    return business


def set_business_logo(business: Business, image: UploadedFile) -> Business:
    """Compress and store the business's brand logo.

    The upload is re-encoded through :func:`core.images.compress_image` bounded to
    ``LOGO_MAX_DIM`` (logos render as small square tiles) before being saved onto
    ``Business.logo``. ``logo_set`` is flipped to ``True`` so the UI knows a real
    logo now exists (it previously tracked only the demo tile). An unparseable
    upload raises ``INVALID_IMAGE`` from the compressor.

    Returns the updated business.
    """
    business.logo = compress_image(image, max_dim=LOGO_MAX_DIM)
    business.logo_set = True
    business.save(update_fields=["logo", "logo_set", "updated_at"])
    emit_event("business_logo_set", business_id=str(business.id))
    return business


def set_business_cover(business: Business, image: UploadedFile) -> Business:
    """Compress and store the business's cover / hero image.

    The upload is re-encoded through :func:`core.images.compress_image` bounded to
    ``COVER_MAX_DIM`` (covers render full-bleed) before being saved onto
    ``Business.cover_image``. ``cover_set`` is flipped to ``True``. An unparseable
    upload raises ``INVALID_IMAGE`` from the compressor.

    Returns the updated business.
    """
    business.cover_image = compress_image(image, max_dim=COVER_MAX_DIM)
    business.cover_set = True
    business.save(update_fields=["cover_image", "cover_set", "updated_at"])
    emit_event("business_cover_set", business_id=str(business.id))
    return business


def set_catalog_item_image(item: CatalogItem, image: UploadedFile) -> CatalogItem:
    """Compress and attach a photo to a catalog item (product / service / menu item).

    The upload is re-encoded through :func:`core.images.compress_image` bounded to
    ``PRODUCT_MAX_DIM`` (catalog cards render at medium size) before being saved onto
    ``CatalogItem.image``. An unparseable upload raises ``INVALID_IMAGE`` from the
    compressor.

    Rules enforced:
    - Only the compression ceiling is applied; no business-rule cap on catalog images
      (one image per item is the data model constraint).

    Returns the updated CatalogItem.
    """
    item.image = compress_image(image, max_dim=PRODUCT_MAX_DIM)
    item.save(update_fields=["image", "updated_at"])
    emit_event("catalog_item_image_set", item_id=str(item.id), business_id=str(item.business_id))
    return item


def add_gallery_image(business: Business, image: UploadedFile) -> "BusinessImage":
    """Add one compressed photo to the business's public gallery.

    Rules enforced:
    - A business may hold at most ``GALLERY_LIMIT`` (8) gallery images. If the
      business is already at the ceiling this function raises
      ``JaqynAPIException("GALLERY_LIMIT_REACHED", status=409)`` and does NOT save.
    - The upload is re-encoded through :func:`core.images.compress_image` bounded
      to ``GALLERY_MAX_DIM`` (gallery images shown full-width on the customer page)
      before being stored.
    - ``sort_order`` is set to ``(current_max + 1)`` so the new image appends to the
      visible order without client-side bookkeeping.
    - An unparseable upload raises ``INVALID_IMAGE`` from the compressor.

    Returns the created BusinessImage.
    """
    current_count: int = business.gallery_images.count()
    if current_count >= GALLERY_LIMIT:
        raise JaqynAPIException(
            code="GALLERY_LIMIT_REACHED",
            message=f"Gallery is full — a business may have at most {GALLERY_LIMIT} images",
            status_code=409,
        )

    # Compute next sort_order so the new photo appends after any existing ones.
    last: Optional[int] = business.gallery_images.aggregate(
        max_order=models.Max("sort_order")  # type: ignore[attr-defined]
    )["max_order"]
    next_sort_order: int = (last + 1) if last is not None else 0

    compressed = compress_image(image, max_dim=GALLERY_MAX_DIM)
    gallery_image: BusinessImage = BusinessImage.objects.create(
        business=business,
        image=compressed,
        sort_order=next_sort_order,
    )
    emit_event("gallery_image_added", gallery_image_id=str(gallery_image.id), business_id=str(business.id))
    return gallery_image


def remove_gallery_image(business: Business, image_id: str) -> None:
    """Delete a gallery image that belongs to the given business.

    Rules enforced:
    - Only images that belong to ``business`` may be deleted; attempting to delete
      a foreign image results in a 404 (the image simply does not exist for this
      business, so the caller cannot probe other businesses' galleries).

    Returns nothing.
    """
    gallery_image: BusinessImage = (
        business.gallery_images.filter(id=image_id).first()
    )  # type: ignore[assignment]
    if gallery_image is None:
        raise JaqynAPIException(
            code="VALIDATION_ERROR",
            message="Gallery image not found",
            status_code=404,
        )
    gallery_image.delete()
    emit_event("gallery_image_removed", gallery_image_id=str(image_id), business_id=str(business.id))
