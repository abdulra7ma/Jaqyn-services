import secrets
import uuid

from django.conf import settings
from django.core.cache import cache
from django.utils.crypto import constant_time_compare
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import CustomerProfile, User
from apps.accounts.tasks import send_email_otp_task, send_otp, send_password_reset_otp_task
from core.email_i18n import resolve_language
from core.exceptions import JaqynAPIException
from core.logging import emit_event
from core.ratelimit import clear_limit, hit_limit

# Minimum gap between two OTP/reset-code sends to the same identifier. 60s
# balances SMS/email cost and code-spam prevention against a user who missed
# the message and wants to retry — a minute is the shortest wait that still
# makes automated resend-hammering uneconomical.
OTP_RESEND_COOLDOWN_SECONDS = 60


def mask_identifier(value: str) -> str:
    """Mask a phone or email for logs/analytics, keeping only a short tail.

    Phones keep the leading country-code chunk and the last 4 digits
    (``+996700123456`` -> ``+996***3456``); short values keep only the last 4.
    Emails mask the local part down to its last 4 chars and keep the domain
    (``dawoud@gmail.com`` -> ``***woud@gmail.com``). Never reversible from the
    output alone — safe to emit in events and DEBUG logs.
    """
    if "@" in value:
        local, _, domain = value.partition("@")
        # Keep at most the last 4 chars of the local part; a 4-char-or-shorter
        # local part keeps only its final char so something is always masked.
        visible = local[-4:] if len(local) > 4 else local[-1:]
        return f"***{visible}@{domain}"
    if len(value) > 8:
        return f"{value[:4]}***{value[-4:]}"
    return f"***{value[-4:]}"


def _resolve_user_email_language(user: User | None, requested_language: str) -> str:
    """Prefer the account's saved CustomerProfile.language over the caller's request.

    Falls back to `requested_language` (typically the locale the client is
    currently displaying) for accounts with no profile yet — e.g. an email OTP
    for a brand-new signup. Either way, resolve_language pins the result to a
    supported code, defaulting to ru.
    """
    profile = getattr(user, "customer_profile", None) if user is not None else None
    if profile is not None:
        return resolve_language(profile.language)
    return resolve_language(requested_language)


def otp_key(phone: str) -> str:
    return f"otp:{phone}"


def otp_attempt_key(phone: str) -> str:
    return f"otp-attempts:{phone}"


def issue_otp(phone: str, ip_address: str | None) -> str:
    """Issue a 6-digit SMS OTP for ``phone`` and return the request_id.

    Guards, in order: a 60s per-phone resend cooldown
    (OTP_RESEND_COOLDOWN_SECONDS — checked first so rapid retries don't burn
    the hourly allowance), then hourly per-phone and per-IP limits
    (OTP_RATE_LIMIT_PER_PHONE / _PER_IP). Any guard tripping raises
    RATE_LIMITED (429). On success the code + request_id are cached under
    OTP_TTL_SECONDS, prior attempt counts are reset, and the SMS is dispatched
    asynchronously.
    """
    if hit_limit(f"otp-resend:{phone}", 1, OTP_RESEND_COOLDOWN_SECONDS):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)
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


def verify_otp(phone: str, code: str) -> tuple[User, bool, str, str]:
    """Verify a phone OTP and return (user, is_new, access_token, refresh_token).

    The submitted code is checked against the cached one with
    ``constant_time_compare`` so response timing can't leak how many leading
    digits matched. Missing cache entry -> OTP_EXPIRED; >5 attempts ->
    RATE_LIMITED; mismatch -> INVALID_OTP. On success creates the user (role
    CUSTOMER) if new, marks the phone verified, ensures a CustomerProfile for
    customers, emits customer_signed_up (masked phone) for new users, clears
    the cached code + attempts, and returns fresh JWTs.
    """
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

        if not constant_time_compare(payload["code"], code):
            raise JaqynAPIException("INVALID_OTP", status_code=status.HTTP_400_BAD_REQUEST)

    user, created = User.objects.get_or_create(phone=phone, defaults={"role": User.Role.CUSTOMER})
    user.is_phone_verified = True
    if not user.role:
        user.role = User.Role.CUSTOMER
    user.save(update_fields=["is_phone_verified", "role", "updated_at"])
    if user.role == User.Role.CUSTOMER:
        CustomerProfile.objects.get_or_create(user=user)
    if created:
        # Masked: raw phone numbers are PII and must not land in event logs.
        emit_event("customer_signed_up", user_id=str(user.id), phone=mask_identifier(phone))

    clear_limit(otp_key(phone))
    clear_limit(otp_attempt_key(phone))
    refresh = RefreshToken.for_user(user)
    return user, created, str(refresh.access_token), str(refresh)


def email_otp_key(email: str) -> str:
    return f"email_otp:{email}"


def email_otp_attempt_key(email: str) -> str:
    return f"email_otp_attempts:{email}"


def issue_email_otp(email: str, ip_address: str | None, language: str = "ru") -> str:
    """Issue a 6-digit OTP for email-based sign-in/signup, mirroring ``issue_otp`` for phone.

    Stores just the code and request_id in Redis keyed by email with OTP_TTL_SECONDS
    TTL — no name/password is collected at this stage. Guarded by a 60s
    per-email resend cooldown (OTP_RESEND_COOLDOWN_SECONDS, checked first so
    rapid retries don't burn the hourly allowance), then rate-limited to
    OTP_RATE_LIMIT_PER_PHONE per hour per email and OTP_RATE_LIMIT_PER_IP per IP.
    Returns a request_id the client echoes back on verification. Email is normalized
    to lowercase so cache keys and stored addresses are consistent. Unknown emails
    fall through to the signup path in ``verify_email_otp``, matching phone's ``verify_otp``.
    Refuses (GOOGLE_ACCOUNT_ONLY) an email already owned by a Google-only account —
    defense in depth alongside ``resolve_login_method``'s same check, so this endpoint
    can't be called directly to route around it.

    ``language`` is the locale the client is currently displaying (ru/en/ky); an
    existing account's saved CustomerProfile.language wins over it (see
    ``_resolve_user_email_language``) so the OTP email matches the user's actual
    preference, not just whatever locale they happen to be browsing in right now.
    """
    email = email.lower()
    existing_user = User.objects.filter(email__iexact=email).select_related("customer_profile").first()
    if existing_user is not None and existing_user.is_google_account:
        raise JaqynAPIException("GOOGLE_ACCOUNT_ONLY", status_code=status.HTTP_401_UNAUTHORIZED)
    if hit_limit(f"email-otp-resend:{email}", 1, OTP_RESEND_COOLDOWN_SECONDS):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    if hit_limit(f"email-otp-email:{email}", settings.OTP_RATE_LIMIT_PER_PHONE, 3600):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    if ip_address and hit_limit(f"email-otp-ip:{ip_address}", settings.OTP_RATE_LIMIT_PER_IP, 3600):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)

    code = f"{secrets.randbelow(1000000):06d}"
    request_id = str(uuid.uuid4())
    cache.set(email_otp_key(email), {"code": code, "request_id": request_id}, settings.OTP_TTL_SECONDS)
    cache.delete(email_otp_attempt_key(email))
    resolved_language = _resolve_user_email_language(existing_user, language)
    send_email_otp_task.delay(email, code, resolved_language)
    return request_id


def verify_email_otp(email: str, code: str) -> tuple[User, bool, str, str]:
    """Verify an email OTP and return (user, is_new, access_token, refresh_token).

    Mirrors ``verify_otp`` for phone: on success, creates a bare user (email only,
    no usable password) if they don't exist yet; marks is_email_verified=True;
    creates CustomerProfile for new customers with profile_completed left False
    (name isn't collected at this stage — the ``/signup/complete`` gate handles
    it); emits customer_signed_up (masked email) for new users. Clears OTP from
    cache on success. The submitted code is checked with ``constant_time_compare``
    so response timing can't leak how many leading digits matched.
    Raises JaqynAPIException on expired/invalid/rate-limited. If a user with this
    email already exists, they are logged in without overwriting their existing
    profile data. Email is normalized to lowercase so the cache lookup, DB query,
    and stored address are all consistent regardless of how the caller supplied it.
    """
    email = email.lower()
    payload = cache.get(email_otp_key(email))
    if not payload:
        raise JaqynAPIException("OTP_EXPIRED", status_code=status.HTTP_400_BAD_REQUEST)

    attempts = cache.get(email_otp_attempt_key(email), 0) + 1
    cache.set(email_otp_attempt_key(email), attempts, settings.OTP_TTL_SECONDS)
    if attempts > 5:
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)

    if not constant_time_compare(payload["code"], code):
        raise JaqynAPIException("INVALID_OTP", status_code=status.HTTP_400_BAD_REQUEST)

    existing = User.objects.filter(email__iexact=email).first()
    is_new = existing is None
    if is_new:
        user = User(email=email, role=User.Role.CUSTOMER, is_email_verified=True)
        user.set_unusable_password()
        user.save()
    else:
        user = existing
        user.is_email_verified = True
        user.save(update_fields=["is_email_verified", "updated_at"])

    if user.role == User.Role.CUSTOMER:
        CustomerProfile.objects.get_or_create(user=user)

    if is_new:
        # Masked: raw emails are PII and must not land in event logs.
        emit_event("customer_signed_up", user_id=str(user.id), email=mask_identifier(email))

    cache.delete(email_otp_key(email))
    cache.delete(email_otp_attempt_key(email))
    refresh = RefreshToken.for_user(user)
    return user, is_new, str(refresh.access_token), str(refresh)


def verify_google_id_token(id_token_str: str) -> dict:
    """Verify a Google Identity Services ID token and return its decoded claims.

    Delegates to google-auth's verify_oauth2_token, which checks the token's
    signature against Google's published JWKS, its expiry/issued-at window, and
    that the issuer is exactly accounts.google.com. We additionally pass
    audience=settings.GOOGLE_OAUTH_CLIENT_ID so a token minted for a different
    OAuth client is rejected. Any failure raises GOOGLE_TOKEN_INVALID without
    revealing which specific check failed.
    """
    try:
        return google_id_token.verify_oauth2_token(
            id_token_str, google_requests.Request(), settings.GOOGLE_OAUTH_CLIENT_ID
        )
    except (ValueError, GoogleAuthError):
        raise JaqynAPIException("GOOGLE_TOKEN_INVALID", status_code=status.HTTP_401_UNAUTHORIZED)


def authenticate_google(id_token_str: str) -> tuple[User, bool, str, str]:
    """Sign in/up a customer via a verified Google ID token. Returns (user, is_new, access, refresh).

    Mirrors ``verify_email_otp``: matches an existing user by email__iexact; if
    none exists, creates a bare user (no usable password) with role=CUSTOMER,
    since Google has already verified the address. Requires the token's
    email_verified claim (GOOGLE_EMAIL_UNVERIFIED otherwise) — the same trust
    bar as a confirmed email OTP. Existing users are logged in without
    overwriting their profile data, with is_email_verified flipped True if it
    wasn't already. CustomerProfile is get_or_create'd for CUSTOMER role with
    profile_completed left False, routing new users through /signup/complete
    same as email OTP. Emits customer_signed_up only for new users.

    New users are flagged is_google_account=True — since they have no usable
    password and no phone, Google is their only way in. ``resolve_login_method``
    refuses these accounts (GOOGLE_ACCOUNT_ONLY) rather than emailing them an
    OTP they didn't ask for. Existing users authenticating via Google keep
    whatever is_google_account value they already had (unaffected).
    """
    claims = verify_google_id_token(id_token_str)
    if not claims.get("email_verified"):
        raise JaqynAPIException("GOOGLE_EMAIL_UNVERIFIED", status_code=status.HTTP_401_UNAUTHORIZED)
    email = claims["email"].lower()

    existing = User.objects.filter(email__iexact=email).first()
    is_new = existing is None
    if is_new:
        user = User(
            email=email, role=User.Role.CUSTOMER, is_email_verified=True, is_google_account=True
        )
        user.set_unusable_password()
        user.save()
    else:
        user = existing
        if not user.is_email_verified:
            user.is_email_verified = True
            user.save(update_fields=["is_email_verified", "updated_at"])

    if user.role == User.Role.CUSTOMER:
        CustomerProfile.objects.get_or_create(user=user)

    if is_new:
        # Masked: raw emails are PII and must not land in event logs.
        emit_event("customer_signed_up", user_id=str(user.id), email=mask_identifier(email))

    refresh = RefreshToken.for_user(user)
    return user, is_new, str(refresh.access_token), str(refresh)


def pwreset_otp_key(email: str) -> str:
    return f"pwreset_otp:{email}"


def pwreset_otp_attempt_key(email: str) -> str:
    return f"pwreset_otp_attempts:{email}"


def issue_password_reset_otp(email: str, ip_address: str | None, language: str = "ru") -> None:
    """Issue a 6-digit password-reset code to an email address.

    Guarded by a 60s per-email resend cooldown (OTP_RESEND_COOLDOWN_SECONDS,
    checked first — before the account lookup — so the cooldown behaves
    identically for existing and unknown emails), then rate-limited per email
    and per IP (OTP_RATE_LIMIT_PER_PHONE / _PER_IP, 3600s).
    To avoid account enumeration this returns normally whether or not an account
    exists: a code is only generated, cached, and emailed when a user with a
    usable password is found for the (lowercased) email; otherwise it is a no-op.

    ``language`` is the locale the client is currently displaying; the account's
    saved CustomerProfile.language wins over it, same as ``issue_email_otp``.
    """
    email = email.lower()
    if hit_limit(f"pwreset-resend:{email}", 1, OTP_RESEND_COOLDOWN_SECONDS):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    if hit_limit(f"pwreset-email:{email}", settings.OTP_RATE_LIMIT_PER_PHONE, 3600):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)
    if ip_address and hit_limit(f"pwreset-ip:{ip_address}", settings.OTP_RATE_LIMIT_PER_IP, 3600):
        raise JaqynAPIException("RATE_LIMITED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)

    user = User.objects.filter(email__iexact=email, is_active=True).select_related("customer_profile").first()
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
    resolved_language = _resolve_user_email_language(user, language)
    send_password_reset_otp_task.delay(email, code, resolved_language)


def reset_password(email: str, code: str, new_password: str) -> tuple[User, str, str]:
    """Verify a password-reset code and set a new password. Returns (user, access, refresh).

    Reads the cached code for the (lowercased) email. Missing -> OTP_EXPIRED.
    Counts attempts; >5 -> RATE_LIMITED. The code is checked with
    ``constant_time_compare`` (no timing side channel); wrong code ->
    INVALID_OTP. On success sets
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

    if not constant_time_compare(payload["code"], code):
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


def resolve_login_method(identifier: str, ip_address: str | None) -> dict[str, str]:
    """Decide how ``identifier`` signs in/up: OTP or password.

    Symmetric for email and phone: password when the matched user has a usable
    password; otherwise OTP — the code is sent now and the ``request_id``
    returned. Unknown identifiers (email or phone) fall through to the OTP
    signup path, matching ``verify_otp``/``verify_email_otp``. Note this reveals
    whether an identifier is password-backed — an accepted, throttled
    enumeration tradeoff (it does not reveal whether the account exists at all,
    since unknown and known-passwordless identifiers get the identical response).

    Accounts created via "Sign in with Google" (``is_google_account``) are
    refused here with GOOGLE_ACCOUNT_ONLY before any OTP is sent — they have no
    usable password and Google is their only way in, so silently emailing them
    an OTP would be the wrong fallback.
    """
    if "@" in identifier:
        email = identifier.lower()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is not None and user.is_google_account:
            raise JaqynAPIException("GOOGLE_ACCOUNT_ONLY", status_code=status.HTTP_401_UNAUTHORIZED)
        if user is not None and user.has_usable_password():
            return {"method": "password"}
        request_id = issue_email_otp(email, ip_address)
        return {"method": "otp", "request_id": request_id}
    user = User.objects.filter(phone=identifier, is_active=True).first()
    if user is not None and user.is_google_account:
        raise JaqynAPIException("GOOGLE_ACCOUNT_ONLY", status_code=status.HTTP_401_UNAUTHORIZED)
    if user is not None and user.has_usable_password():
        return {"method": "password"}
    request_id = issue_otp(identifier, ip_address)
    return {"method": "otp", "request_id": request_id}


def resolve_area(user):
    """The app area a user lands in after login. Priority: owner > staff > customer."""
    from apps.businesses.models import Business

    if Business.objects.filter(owner=user).exists():
        return "business"
    if user.staff_memberships.filter(is_active=True).exists():
        return "staff"
    return "customer"


def resolve_areas(user) -> list[str]:
    """Every app area the user may enter (a user can hold more than one).

    ``resolve_area`` picks the single landing area; this lists all areas the UI
    should let them switch into. An owner who also has an active StaffMember row
    (see ``ensure_owner_staff``) gets both "business" and "staff", which is what
    drives the owner→staff switch and its conditional nav item. Order mirrors the
    landing priority (business > staff > customer) so the first entry equals
    ``resolve_area``.
    """
    from apps.businesses.models import Business

    areas = []
    if Business.objects.filter(owner=user).exists():
        areas.append("business")
    if user.staff_memberships.filter(is_active=True).exists():
        areas.append("staff")
    if not areas:
        areas.append("customer")
    return areas


def authenticate_identifier(identifier: str, password: str) -> tuple[User, str, str]:
    """Password login by phone OR email. Returns (user, access, refresh).

    Email (contains ``@``) matches on ``email__iexact``; otherwise on ``phone``.
    Same generic ``INVALID_CREDENTIALS`` on any failure (no user, unusable
    password, wrong password) so the reason isn't leaked.
    """
    if "@" in identifier:
        user = User.objects.filter(email__iexact=identifier, is_active=True).first()
    else:
        user = User.objects.filter(phone=identifier, is_active=True).first()
    if user is None or not user.has_usable_password() or not user.check_password(password):
        raise JaqynAPIException(
            "INVALID_CREDENTIALS", "Invalid credentials", status.HTTP_401_UNAUTHORIZED
        )
    refresh = RefreshToken.for_user(user)
    return user, str(refresh.access_token), str(refresh)


# Backward-compatible alias (any other callers keep working).
def authenticate_password(email: str, password: str) -> tuple[User, str, str]:
    """Alias for authenticate_identifier; accepts email or phone."""
    return authenticate_identifier(email, password)
