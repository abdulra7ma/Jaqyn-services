from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from rest_framework import status

from apps.accounts.models import User
from apps.businesses.models import Business
from core.exceptions import JaqynAPIException
from core.images import COVER_MAX_DIM, LOGO_MAX_DIM, compress_image
from core.logging import emit_event


@transaction.atomic
def register_business(owner, data):
    if hasattr(owner, "owned_business"):
        raise JaqynAPIException("VALIDATION_ERROR", "Owner already has a business", status.HTTP_409_CONFLICT)

    owner.role = User.Role.BUSINESS_OWNER
    owner.save(update_fields=["role", "updated_at"])
    business = Business.objects.create(owner=owner, **data)
    emit_event("business_registered", business_id=str(business.id), owner_id=str(owner.id))
    return business


def approve_business(business, admin_user=None):
    business.status = Business.Status.APPROVED
    business.save(update_fields=["status", "updated_at"])
    emit_event("business_approved", business_id=str(business.id))
    if admin_user:
        emit_event("admin_approved_business", business_id=str(business.id), admin_id=str(admin_user.id))
    return business


def reject_business(business, admin_user=None, reason=None):
    business.status = Business.Status.REJECTED
    business.save(update_fields=["status", "updated_at"])
    emit_event("admin_rejected_business", business_id=str(business.id), admin_id=str(getattr(admin_user, "id", "")), reason=reason)
    return business


def disable_business(business, admin_user=None):
    business.status = Business.Status.DISABLED
    business.save(update_fields=["status", "updated_at"])
    business.qr_tokens.filter(is_active=True).update(is_active=False)
    emit_event("admin_disabled_business", business_id=str(business.id), admin_id=str(getattr(admin_user, "id", "")))
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
