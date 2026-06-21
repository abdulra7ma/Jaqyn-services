import secrets
import uuid

from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import CustomerProfile, User
from apps.accounts.tasks import send_otp
from core.exceptions import JaqynAPIException
from core.logging import emit_event
from core.ratelimit import clear_limit, hit_limit


def otp_key(phone):
    return f"otp:{phone}"


def otp_attempt_key(phone):
    return f"otp-attempts:{phone}"


def issue_otp(phone, ip_address):
    if hit_limit(f"otp-phone:{phone}", settings.OTP_RATE_LIMIT_PER_PHONE, 3600):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    if ip_address and hit_limit(f"otp-ip:{ip_address}", settings.OTP_RATE_LIMIT_PER_IP, 3600):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)

    code = f"{secrets.randbelow(1000000):06d}"
    request_id = str(uuid.uuid4())
    cache.set(otp_key(phone), {"code": code, "request_id": request_id}, settings.OTP_TTL_SECONDS)
    cache.delete(otp_attempt_key(phone))
    send_otp.delay(phone, code)
    return request_id


def verify_otp(phone, code):
    dev_otp = getattr(settings, "DEV_LOGIN_OTP", "")
    if dev_otp and code == dev_otp:
        # Dev static OTP — accept without the cache/attempt checks. Gated on the
        # DEV_LOGIN_OTP setting, which must stay empty in production.
        pass
    else:
        payload = cache.get(otp_key(phone))
        if not payload:
            raise JaqynAPIException("OTP_EXPIRED", status_code=status.HTTP_400_BAD_REQUEST)

        attempts = cache.get(otp_attempt_key(phone), 0) + 1
        cache.set(otp_attempt_key(phone), attempts, settings.OTP_TTL_SECONDS)
        if attempts > 5:
            raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)

        if payload["code"] != code:
            raise JaqynAPIException("INVALID_OTP", status_code=status.HTTP_400_BAD_REQUEST)

    user, created = User.objects.get_or_create(phone=phone, defaults={"role": User.Role.CUSTOMER})
    user.is_phone_verified = True
    if not user.role:
        user.role = User.Role.CUSTOMER
    user.save(update_fields=["is_phone_verified", "role", "updated_at"])
    if user.role == User.Role.CUSTOMER:
        CustomerProfile.objects.get_or_create(user=user)
    if created:
        emit_event("customer_signed_up", user_id=str(user.id), phone=phone)

    clear_limit(otp_key(phone))
    clear_limit(otp_attempt_key(phone))
    refresh = RefreshToken.for_user(user)
    return user, created, str(refresh.access_token), str(refresh)


def resolve_area(user):
    """The app area a user lands in after login. Priority: owner > staff > customer."""
    from apps.businesses.models import Business

    if Business.objects.filter(owner=user).exists():
        return "business"
    if user.staff_memberships.filter(is_active=True).exists():
        return "staff"
    return "customer"


def authenticate_password(email, password):
    """Email + password fallback login. Returns (user, access, refresh)."""
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is None or not user.has_usable_password() or not user.check_password(password):
        raise JaqynAPIException(
            "INVALID_CREDENTIALS", "Invalid email or password", status.HTTP_401_UNAUTHORIZED
        )
    refresh = RefreshToken.for_user(user)
    return user, str(refresh.access_token), str(refresh)
