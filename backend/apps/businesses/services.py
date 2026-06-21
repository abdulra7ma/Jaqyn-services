from django.db import transaction
from rest_framework import status

from apps.accounts.models import User
from apps.businesses.models import Business
from core.exceptions import JaqynAPIException
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
