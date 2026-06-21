import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.qr.models import ApprovalCode, QRCodeToken, ScanLog
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException
from core.logging import emit_event, log_scan
from core.qr import generate_token
from core.ratelimit import hit_limit


def create_token(token_type, **kwargs):
    token = generate_token()
    while QRCodeToken.objects.filter(token=token).exists():
        token = generate_token()
    return QRCodeToken.objects.create(token=token, type=token_type, **kwargs)


def get_or_create_merchant_collect_token(business):
    token, _ = QRCodeToken.objects.get_or_create(
        business=business,
        type=QRCodeToken.Type.MERCHANT_COLLECT,
        defaults={"token": generate_token()},
    )
    return token


def get_or_create_customer_profile_token(user):
    token, _ = QRCodeToken.objects.get_or_create(
        customer=user,
        type=QRCodeToken.Type.CUSTOMER_PROFILE,
        defaults={"token": generate_token()},
    )
    return token


def resolve_qr_token(raw_token, request=None, action="resolve"):
    ip = request.META.get("REMOTE_ADDR") if request else None
    ua = request.META.get("HTTP_USER_AGENT", "") if request else ""
    try:
        token = QRCodeToken.objects.select_related("business").get(token=raw_token)
    except QRCodeToken.DoesNotExist:
        log_scan(token_value=raw_token, action=action, status=ScanLog.Status.FAILED, failure_reason="INVALID_QR_TOKEN", ip_address=ip, user_agent=ua)
        raise JaqynAPIException("INVALID_QR_TOKEN", status_code=status.HTTP_404_NOT_FOUND)

    if not token.is_active:
        log_scan(qr_token=token, token_value=raw_token, business=token.business, action=action, status=ScanLog.Status.BLOCKED, failure_reason="INVALID_QR_TOKEN", ip_address=ip, user_agent=ua)
        raise JaqynAPIException("INVALID_QR_TOKEN", status_code=status.HTTP_400_BAD_REQUEST)

    if token.expires_at and token.expires_at <= timezone.now():
        log_scan(qr_token=token, token_value=raw_token, business=token.business, action=action, status=ScanLog.Status.BLOCKED, failure_reason="QR_TOKEN_EXPIRED", ip_address=ip, user_agent=ua)
        raise JaqynAPIException("QR_TOKEN_EXPIRED", status_code=status.HTTP_400_BAD_REQUEST)

    log_scan(qr_token=token, token_value=raw_token, business=token.business, action=action, status=ScanLog.Status.SUCCESS, ip_address=ip, user_agent=ua)
    return token


def code_window(now=None):
    now = now or timezone.now()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def generate_approval_code(business):
    ApprovalCode.objects.filter(business=business, is_active=True).update(is_active=False)
    start, end = code_window()
    return ApprovalCode.objects.create(
        business=business,
        code=f"{secrets.randbelow(1000000):06d}",
        valid_from=start,
        valid_to=end,
    )


def current_approval_code(business):
    now = timezone.now()
    code = ApprovalCode.objects.filter(business=business, is_active=True, valid_from__lte=now, valid_to__gt=now).order_by("-created_at").first()
    if code:
        return code
    return generate_approval_code(business)


def validate_approval_code(business, code, customer=None, request=None):
    ip = request.META.get("REMOTE_ADDR") if request else None
    ua = request.META.get("HTTP_USER_AGENT", "") if request else ""
    key = f"approval-failed:{business.id}:{getattr(customer, 'id', ip)}"
    now = timezone.now()
    ok = ApprovalCode.objects.filter(business=business, code=code, is_active=True, valid_from__lte=now, valid_to__gt=now).exists()
    if not ok:
        hit_limit(key, settings.APPROVAL_CODE_FAILED_LIMIT, 3600)
        log_scan(customer=customer, business=business, action="validate_code", status=ScanLog.Status.FAILED, failure_reason="INVALID_APPROVAL_CODE", ip_address=ip, user_agent=ua)
        raise JaqynAPIException("INVALID_APPROVAL_CODE", status_code=status.HTTP_400_BAD_REQUEST)

    log_scan(customer=customer, business=business, action="validate_code", status=ScanLog.Status.SUCCESS, ip_address=ip, user_agent=ua)
    return True


def link_staff_user(staff_member, phone=None, email=None, password=None, name=None):
    """Ensure a StaffMember is backed by a User account (role=staff) so the staff
    member can log in via the unified phone-OTP / email-password flow. Idempotent."""
    user = staff_member.user
    if user is None:
        phone = phone or f"+99670{staff_member.id.hex[:9]}"
        user = User.objects.create_user(
            phone=phone, role=User.Role.STAFF, is_phone_verified=True, name=name or staff_member.name
        )
        staff_member.user = user
        staff_member.save(update_fields=["user", "updated_at"])

    update_fields = []
    # Repoint a placeholder/legacy phone to the canonical one (if free).
    if phone and user.phone != phone and not User.objects.filter(phone=phone).exclude(pk=user.pk).exists():
        user.phone = phone
        user.is_phone_verified = True
        update_fields += ["phone", "is_phone_verified"]
    if name and user.name != name:
        user.name = name
        update_fields.append("name")
    if user.role != User.Role.STAFF:
        user.role = User.Role.STAFF
        update_fields.append("role")
    if email and user.email != email:
        user.email = email
        update_fields.append("email")
    if password:
        user.set_password(password)
        update_fields.append("password")
    if update_fields:
        update_fields.append("updated_at")
        user.save(update_fields=update_fields)
    return user


def staff_token(staff_member, **kwargs):
    """Provision (if needed) the staff user and return a fresh access token. Used by
    seeds and tests; production staff log in through /api/auth/."""
    user = link_staff_user(staff_member, **kwargs)
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token)


def rotate_codes_for_all_businesses():
    count = 0
    for business in Business.objects.filter(status=Business.Status.APPROVED):
        generate_approval_code(business)
        count += 1
    return count
