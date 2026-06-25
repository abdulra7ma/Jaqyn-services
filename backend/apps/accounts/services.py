import secrets
import uuid

from django.contrib.auth.hashers import make_password as django_make_password

from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import CustomerProfile, User
from apps.accounts.tasks import send_email_otp_task, send_otp, send_password_reset_otp_task
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


def email_otp_key(email: str) -> str:
    return f"email_otp:{email}"


def email_otp_attempt_key(email: str) -> str:
    return f"email_otp_attempts:{email}"


def issue_email_otp(
    email: str,
    name: str,
    password: str,
    phone: str | None,
    ip_address: str | None,
) -> str:
    """Issue a 6-digit OTP for email-based customer signup.

    Stores the pending registration payload (name, hashed password, phone) and
    OTP code in Redis keyed by email with OTP_TTL_SECONDS TTL. Rate-limited to
    OTP_RATE_LIMIT_PER_PHONE per hour per email and OTP_RATE_LIMIT_PER_IP per IP.
    Returns a request_id the client echoes back on verification.
    Email is normalized to lowercase so cache keys and stored addresses are consistent.
    """
    email = email.lower()
    if hit_limit(f"email-otp-email:{email}", settings.OTP_RATE_LIMIT_PER_PHONE, 3600):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    if ip_address and hit_limit(f"email-otp-ip:{ip_address}", settings.OTP_RATE_LIMIT_PER_IP, 3600):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)

    code = f"{secrets.randbelow(1000000):06d}"
    request_id = str(uuid.uuid4())
    cache.set(
        email_otp_key(email),
        {
            "code": code,
            "request_id": request_id,
            "name": name,
            # Hash before caching — never store a raw password in Redis.
            "password_hash": django_make_password(password),
            "phone": phone,
        },
        settings.OTP_TTL_SECONDS,
    )
    cache.delete(email_otp_attempt_key(email))
    send_email_otp_task.delay(email, code)
    return request_id


def verify_email_otp(email: str, code: str) -> tuple[User, bool, str, str]:
    """Verify an email OTP and return (user, is_new, access_token, refresh_token).

    On success: creates the user from the cached registration payload if they
    don't exist yet; marks is_email_verified=True; creates CustomerProfile for
    new customers; emits customer_signed_up for new users. Clears OTP from
    cache on success. Raises JaqynAPIException on expired/invalid/rate-limited.
    If a user with this email already exists, they are logged in without
    overwriting their existing profile data.
    Email is normalized to lowercase so the cache lookup, DB query, and stored
    address are all consistent regardless of how the caller supplied the address.
    """
    email = email.lower()
    payload = cache.get(email_otp_key(email))
    if not payload:
        raise JaqynAPIException("OTP_EXPIRED", status_code=status.HTTP_400_BAD_REQUEST)

    attempts = cache.get(email_otp_attempt_key(email), 0) + 1
    cache.set(email_otp_attempt_key(email), attempts, settings.OTP_TTL_SECONDS)
    if attempts > 5:
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)

    if payload["code"] != code:
        raise JaqynAPIException("INVALID_OTP", status_code=status.HTTP_400_BAD_REQUEST)

    existing = User.objects.filter(email__iexact=email).first()
    is_new = existing is None
    if is_new:
        user = User(
            email=email,
            name=payload.get("name"),
            phone=payload.get("phone") or None,
            role=User.Role.CUSTOMER,
            is_email_verified=True,
        )
        # Assign the pre-hashed password directly to avoid double-hashing.
        user.password = payload["password_hash"]
        user.save()
    else:
        user = existing
        user.is_email_verified = True
        user.save(update_fields=["is_email_verified", "updated_at"])

    if user.role == User.Role.CUSTOMER:
        CustomerProfile.objects.get_or_create(user=user)

    if is_new:
        emit_event("customer_signed_up", user_id=str(user.id), email=email)

    cache.delete(email_otp_key(email))
    cache.delete(email_otp_attempt_key(email))
    refresh = RefreshToken.for_user(user)
    return user, is_new, str(refresh.access_token), str(refresh)


def pwreset_otp_key(email: str) -> str:
    return f"pwreset_otp:{email}"


def pwreset_otp_attempt_key(email: str) -> str:
    return f"pwreset_otp_attempts:{email}"


def issue_password_reset_otp(email: str, ip_address: str | None) -> None:
    """Issue a 6-digit password-reset code to an email address.

    Rate-limited per email and per IP (OTP_RATE_LIMIT_PER_PHONE / _PER_IP, 3600s).
    To avoid account enumeration this returns normally whether or not an account
    exists: a code is only generated, cached, and emailed when a user with a
    usable password is found for the (lowercased) email; otherwise it is a no-op.
    """
    email = email.lower()
    if hit_limit(f"pwreset-email:{email}", settings.OTP_RATE_LIMIT_PER_PHONE, 3600):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    if ip_address and hit_limit(f"pwreset-ip:{ip_address}", settings.OTP_RATE_LIMIT_PER_IP, 3600):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)

    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is None or not user.has_usable_password():
        # Silent no-op — never reveal whether the address has an account.
        return

    code = f"{secrets.randbelow(1000000):06d}"
    request_id = str(uuid.uuid4())
    cache.set(
        pwreset_otp_key(email),
        {"code": code, "request_id": request_id},
        settings.OTP_TTL_SECONDS,
    )
    cache.delete(pwreset_otp_attempt_key(email))
    send_password_reset_otp_task.delay(email, code)


def reset_password(email: str, code: str, new_password: str) -> tuple[User, str, str]:
    """Verify a password-reset code and set a new password. Returns (user, access, refresh).

    Reads the cached code for the (lowercased) email. Missing -> OTP_EXPIRED.
    Counts attempts; >5 -> RATE_LIMITED. Wrong code -> INVALID_OTP. On success sets
    the new password, clears the cached code + attempts, and returns fresh JWTs so
    the caller is logged straight in.
    """
    email = email.lower()
    payload = cache.get(pwreset_otp_key(email))
    if not payload:
        raise JaqynAPIException("OTP_EXPIRED", status_code=status.HTTP_400_BAD_REQUEST)

    attempts = cache.get(pwreset_otp_attempt_key(email), 0) + 1
    cache.set(pwreset_otp_attempt_key(email), attempts, settings.OTP_TTL_SECONDS)
    if attempts > 5:
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)

    if payload["code"] != code:
        raise JaqynAPIException("INVALID_OTP", status_code=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user is None:
        # Defensive: a code only exists for a real account, but guard anyway.
        raise JaqynAPIException("INVALID_OTP", status_code=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save(update_fields=["password", "updated_at"])

    cache.delete(pwreset_otp_key(email))
    cache.delete(pwreset_otp_attempt_key(email))
    refresh = RefreshToken.for_user(user)
    return user, str(refresh.access_token), str(refresh)


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
