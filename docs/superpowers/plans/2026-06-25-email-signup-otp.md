# Email Signup with OTP Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email-based customer signup with a 6-digit OTP verification code sent to the user's email, alongside the existing phone OTP and email+password flows.

**Architecture:** Backend adds two endpoints (`request-email-otp/`, `verify-email-otp/`) mirroring the phone OTP pattern — OTP + pending registration payload stored in Redis with TTL. User model gains `is_email_verified`, phone becomes nullable (email-only users have no phone). Frontend adds `/signup` method-picker and `/signup/email` multi-step page (form → OTP verify + resend).

**Tech Stack:** Django 5 / DRF / Redis cache / Celery / Django email backend. Next.js 14 App Router / TanStack Query 5 / `@jaqyn/api` / `@jaqyn/i18n` / Tailwind.

---

## File Map

**Create:**
- `backend/apps/accounts/migrations/0004_user_email_otp.py` — migration: phone nullable, email unique, is_email_verified
- `backend/apps/accounts/tests/test_email_otp_service.py` — service unit tests
- `backend/apps/accounts/tests/test_email_otp_views.py` — endpoint integration tests
- `frontend/apps/web/app/signup/page.tsx` — method-picker entry page
- `frontend/apps/web/app/signup/email/page.tsx` — multi-step email signup (form + OTP)

**Modify:**
- `backend/apps/accounts/models.py` — phone nullable, email unique, is_email_verified field, UserManager update
- `backend/apps/accounts/serializers.py` — UserSerializer + two new OTP serializers
- `backend/apps/accounts/services.py` — issue_email_otp, verify_email_otp
- `backend/apps/accounts/tasks.py` — send_email_otp_task
- `backend/apps/accounts/views.py` — RequestEmailOTPView, VerifyEmailOTPView
- `backend/apps/accounts/urls.py` — two new routes
- `frontend/packages/api/src/customer/types.ts` — User.phone nullable, is_email_verified, new payload types
- `frontend/packages/api/src/customer/api.ts` — CustomerApi interface + implementation
- `frontend/packages/api/src/customer/hooks.ts` — useRequestEmailOtp, useVerifyEmailOtp
- `frontend/packages/i18n/src/locales.ts` — signup.* keys
- `frontend/apps/web/app/login/page.tsx` — "Don't have an account?" sign-up link

---

## Task 1: Update User model + generate migration

**Files:**
- Modify: `backend/apps/accounts/models.py`
- Create: `backend/apps/accounts/migrations/0004_user_email_otp.py`

- [ ] **Step 1: Update models.py**

Replace the full content of `backend/apps/accounts/models.py`:

```python
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from core.fields import TimeStampedModel


class UserManager(BaseUserManager):
    def create_user(self, phone=None, password=None, **extra_fields):
        if not phone and not extra_fields.get("email"):
            raise ValueError("Either phone or email is required")
        user = self.model(phone=phone or None, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone=None, password=None, **extra_fields):
        extra_fields.setdefault("role", User.Role.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_phone_verified", True)
        return self.create_user(phone, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    class Role(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        BUSINESS_OWNER = "business_owner", "Business owner"
        STAFF = "staff", "Staff"
        ADMIN = "admin", "Admin"

    phone = models.CharField(max_length=32, unique=True, null=True, blank=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    email = models.EmailField(blank=True, null=True, unique=True)
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.CUSTOMER)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_phone_verified = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    avatar = models.ImageField(upload_to="users/avatars/", blank=True, null=True)
    avatar_emoji = models.CharField(max_length=8, blank=True, default="")

    objects = UserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = []

    def __str__(self) -> str:
        return self.phone or self.email or str(self.id)


class CustomerProfile(TimeStampedModel):
    class Language(models.TextChoices):
        RU = "ru", "Russian"
        EN = "en", "English"
        KY = "ky", "Kyrgyz"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="customer_profile")
    birthday = models.DateField(blank=True, null=True)
    language = models.CharField(max_length=2, choices=Language.choices, default=Language.RU)
    marketing_opt_in = models.BooleanField(default=False)
    # First-run product tour seen. Persisted so the tour survives relogin/reinstall.
    onboarding_completed = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"Profile {self.user}"
```

- [ ] **Step 2: Generate migration**

```bash
cd backend && python manage.py makemigrations accounts --name user_email_otp
```

Expected output: `Migrations for 'accounts': apps/accounts/migrations/0004_user_email_otp.py`

- [ ] **Step 3: Apply migration locally**

```bash
cd backend && python manage.py migrate accounts
```

Expected: `Applying accounts.0004_user_email_otp... OK`

- [ ] **Step 4: Update UserSerializer to expose is_email_verified**

In `backend/apps/accounts/serializers.py`, update `UserSerializer.Meta.fields`:

```python
class UserSerializer(serializers.ModelSerializer):
    avatar = serializers.SerializerMethodField()

    def get_avatar(self, obj):
        if obj.avatar:
            return obj.avatar.url
        return None

    class Meta:
        model = User
        fields = (
            "id", "phone", "name", "email", "role",
            "is_phone_verified", "is_email_verified",
            "created_at", "avatar", "avatar_emoji",
        )
        read_only_fields = fields
```

- [ ] **Step 5: Commit**

```bash
git add backend/apps/accounts/models.py backend/apps/accounts/serializers.py backend/apps/accounts/migrations/0004_user_email_otp.py
git commit -m "feat: make phone nullable, add email unique constraint and is_email_verified field"
```

---

## Task 2: Add email OTP Celery task

**Files:**
- Modify: `backend/apps/accounts/tasks.py`

- [ ] **Step 1: Replace tasks.py content**

```python
import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from apps.notifications.models import NotificationLog
from apps.notifications.services import notifier

logger = logging.getLogger(__name__)


@shared_task
def send_otp(phone, code):
    logger.info("dev_otp phone=%s code=%s", phone, code)
    return str(notifier.send(None, "sms", "otp", {"phone": phone, "code": code}).id)


@shared_task(max_retries=3, default_retry_delay=5, time_limit=30)
def send_email_otp_task(email: str, code: str) -> None:
    """Send a 6-digit OTP to the given email address via Django's email backend."""
    expiry_minutes = getattr(settings, "OTP_TTL_SECONDS", 300) // 60
    send_mail(
        subject="Your Jaqyn verification code",
        message=(
            f"Your verification code is: {code}\n\n"
            f"This code expires in {expiry_minutes} minutes.\n"
            f"If you did not request this, you can ignore this email."
        ),
        html_message=(
            f"<p>Your Jaqyn verification code is:</p>"
            f"<p style='font-size:32px;letter-spacing:6px;font-weight:bold'>{code}</p>"
            f"<p>This code expires in {expiry_minutes} minutes.</p>"
            f"<p>If you did not request this, you can ignore this email.</p>"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )
```

- [ ] **Step 2: Commit**

```bash
git add backend/apps/accounts/tasks.py
git commit -m "feat: add send_email_otp_task Celery task"
```

---

## Task 3: Add email OTP service functions

**Files:**
- Modify: `backend/apps/accounts/services.py`
- Create: `backend/apps/accounts/tests/test_email_otp_service.py`

- [ ] **Step 1: Write failing tests**

Create `backend/apps/accounts/tests/test_email_otp_service.py`:

```python
import pytest
from unittest.mock import patch
from django.core.cache import cache

from apps.accounts.models import CustomerProfile, User
from apps.accounts.services import issue_email_otp, verify_email_otp
from core.exceptions import JaqynAPIException


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def _issue(email="user@example.com", name="Alice", password="secret123", phone=None, ip="1.2.3.4"):
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        return issue_email_otp(email=email, name=name, password=password, phone=phone, ip_address=ip)


@pytest.mark.django_db
def test_issue_email_otp_stores_payload_in_cache():
    _issue()
    payload = cache.get("email_otp:user@example.com")
    assert payload is not None
    assert payload["name"] == "Alice"
    assert len(payload["code"]) == 6
    assert "password_hash" in payload


@pytest.mark.django_db
def test_issue_email_otp_returns_request_id():
    request_id = _issue()
    assert request_id is not None
    assert len(request_id) == 36  # UUID format


@pytest.mark.django_db
def test_issue_email_otp_rate_limits_by_email():
    for _ in range(3):
        _issue()
    with pytest.raises(JaqynAPIException) as exc:
        _issue()
    assert exc.value.code == "RATE_LIMITED"


@pytest.mark.django_db
def test_verify_email_otp_creates_user_and_returns_tokens():
    _issue(email="new@example.com", name="Bob", password="pass123", phone="+996700000000")
    payload = cache.get("email_otp:new@example.com")
    user, is_new, access, refresh = verify_email_otp("new@example.com", payload["code"])
    assert is_new is True
    assert user.email == "new@example.com"
    assert user.name == "Bob"
    assert user.phone == "+996700000000"
    assert user.is_email_verified is True
    assert user.role == User.Role.CUSTOMER
    assert CustomerProfile.objects.filter(user=user).exists()
    assert access
    assert refresh


@pytest.mark.django_db
def test_verify_email_otp_password_is_usable():
    _issue(email="pw@example.com", password="mypassword")
    payload = cache.get("email_otp:pw@example.com")
    user, _, _, _ = verify_email_otp("pw@example.com", payload["code"])
    assert user.check_password("mypassword")


@pytest.mark.django_db
def test_verify_email_otp_wrong_code_raises():
    _issue(email="bad@example.com")
    with pytest.raises(JaqynAPIException) as exc:
        verify_email_otp("bad@example.com", "000000")
    assert exc.value.code == "INVALID_OTP"


@pytest.mark.django_db
def test_verify_email_otp_expired_raises():
    with pytest.raises(JaqynAPIException) as exc:
        verify_email_otp("ghost@example.com", "123456")
    assert exc.value.code == "OTP_EXPIRED"


@pytest.mark.django_db
def test_verify_email_otp_clears_cache_on_success():
    _issue(email="clean@example.com")
    payload = cache.get("email_otp:clean@example.com")
    verify_email_otp("clean@example.com", payload["code"])
    assert cache.get("email_otp:clean@example.com") is None


@pytest.mark.django_db
def test_verify_email_otp_existing_user_logs_in_without_overwrite():
    user = User.objects.create(email="existing@example.com", name="Original", role=User.Role.CUSTOMER)
    user.set_password("oldpassword")
    user.save()
    CustomerProfile.objects.create(user=user)

    _issue(email="existing@example.com", name="NewName", password="newpassword")
    payload = cache.get("email_otp:existing@example.com")
    returned_user, is_new, access, refresh = verify_email_otp("existing@example.com", payload["code"])

    assert is_new is False
    assert returned_user.id == user.id
    assert returned_user.is_email_verified is True
    assert returned_user.name == "Original"  # not overwritten
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest apps/accounts/tests/test_email_otp_service.py -v 2>&1 | head -20
```

Expected: `ImportError: cannot import name 'issue_email_otp' from 'apps.accounts.services'`

- [ ] **Step 3: Add email OTP functions to services.py**

Add `from django.contrib.auth.hashers import make_password as django_make_password` to the imports in `backend/apps/accounts/services.py`.

Also update the task import line from:
```python
from apps.accounts.tasks import send_otp
```
to:
```python
from apps.accounts.tasks import send_email_otp_task, send_otp
```

Then add these functions after `verify_otp` and before `resolve_area`:

```python
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
    """
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
    """
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest apps/accounts/tests/test_email_otp_service.py -v
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/accounts/services.py backend/apps/accounts/tests/test_email_otp_service.py
git commit -m "feat: add issue_email_otp and verify_email_otp service functions"
```

---

## Task 4: Add serializers, views, and URL routes

**Files:**
- Modify: `backend/apps/accounts/serializers.py`
- Modify: `backend/apps/accounts/views.py`
- Modify: `backend/apps/accounts/urls.py`
- Create: `backend/apps/accounts/tests/test_email_otp_views.py`

- [ ] **Step 1: Add two new serializers to serializers.py**

Add at the end of `backend/apps/accounts/serializers.py`:

```python
class RequestEmailOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=255)
    password = serializers.CharField(min_length=8, max_length=128)
    phone = serializers.RegexField(
        regex=r"^\+[1-9]\d{7,14}$", required=False, allow_blank=True, allow_null=True
    )


class VerifyEmailOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)
```

- [ ] **Step 2: Add two new views to views.py**

Update the import block at the top of `backend/apps/accounts/views.py`:

```python
from apps.accounts.serializers import (
    CustomerProfileSerializer,
    PasswordLoginSerializer,
    ProfileUpdateSerializer,
    RequestEmailOTPSerializer,
    RequestOTPSerializer,
    UserSerializer,
    VerifyEmailOTPSerializer,
    VerifyOTPSerializer,
)
from apps.accounts.services import (
    authenticate_password,
    issue_email_otp,
    issue_otp,
    resolve_area,
    verify_email_otp,
    verify_otp,
)
```

Add these two views after `VerifyOTPView` and before `PasswordLoginView`:

```python
class RequestEmailOTPView(APIView):
    permission_classes = [AllowAny]  # Public signup endpoint — no token required

    def post(self, request):
        serializer = RequestEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        from django.conf import settings

        request_id = issue_email_otp(
            email=d["email"],
            name=d["name"],
            password=d["password"],
            phone=d.get("phone") or None,
            ip_address=request_ip(request),
        )
        return success_response({"request_id": request_id, "expires_in": settings.OTP_TTL_SECONDS})


class VerifyEmailOTPView(APIView):
    permission_classes = [AllowAny]  # Public signup endpoint — no token required

    def post(self, request):
        serializer = VerifyEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, is_new, access, refresh = verify_email_otp(
            serializer.validated_data["email"],
            serializer.validated_data["code"],
        )
        return success_response(_auth_payload(user, access, refresh, is_new=is_new))
```

- [ ] **Step 3: Add routes to urls.py**

Replace the full content of `backend/apps/accounts/urls.py`:

```python
from django.urls import path

from apps.accounts.views import (
    AvatarUploadView,
    LogoutView,
    MeView,
    PasswordLoginView,
    ProfileView,
    RequestEmailOTPView,
    RequestOTPView,
    VerifyEmailOTPView,
    VerifyOTPView,
)

urlpatterns = [
    path("request-otp/", RequestOTPView.as_view(), name="request-otp"),
    path("verify-otp/", VerifyOTPView.as_view(), name="verify-otp"),
    path("request-email-otp/", RequestEmailOTPView.as_view(), name="request-email-otp"),
    path("verify-email-otp/", VerifyEmailOTPView.as_view(), name="verify-email-otp"),
    path("login-password/", PasswordLoginView.as_view(), name="login-password"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("avatar/", AvatarUploadView.as_view(), name="avatar-upload"),
]
```

- [ ] **Step 4: Write endpoint tests**

Create `backend/apps/accounts/tests/test_email_otp_views.py`:

```python
import pytest
from unittest.mock import patch
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def _request_otp(client, email="test@example.com", name="Test User", password="password123"):
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        return client.post(
            "/api/auth/request-email-otp/",
            {"email": email, "name": name, "password": password},
            format="json",
        )


@pytest.mark.django_db
def test_request_email_otp_returns_200_and_request_id(client):
    res = _request_otp(client)
    assert res.status_code == 200
    data = res.json()["data"]
    assert "request_id" in data
    assert "expires_in" in data


@pytest.mark.django_db
def test_request_email_otp_missing_name_returns_400(client):
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        res = client.post(
            "/api/auth/request-email-otp/",
            {"email": "test@example.com", "password": "password123"},
            format="json",
        )
    assert res.status_code == 400


@pytest.mark.django_db
def test_request_email_otp_short_password_returns_400(client):
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        res = client.post(
            "/api/auth/request-email-otp/",
            {"email": "test@example.com", "name": "Test", "password": "short"},
            format="json",
        )
    assert res.status_code == 400


@pytest.mark.django_db
def test_request_email_otp_no_auth_required(client):
    """Signup endpoint accessible without a JWT token."""
    res = _request_otp(client, email="anon@example.com")
    assert res.status_code == 200


@pytest.mark.django_db
def test_verify_email_otp_creates_user_returns_jwt(client):
    _request_otp(client, email="new@example.com", name="New User")
    payload = cache.get("email_otp:new@example.com")
    res = client.post(
        "/api/auth/verify-email-otp/",
        {"email": "new@example.com", "code": payload["code"]},
        format="json",
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert "access" in data
    assert "refresh" in data
    assert data["is_new"] is True
    assert data["user"]["email"] == "new@example.com"
    assert data["user"]["is_email_verified"] is True
    assert User.objects.filter(email="new@example.com").exists()


@pytest.mark.django_db
def test_verify_email_otp_wrong_code_returns_400(client):
    _request_otp(client, email="bad@example.com")
    res = client.post(
        "/api/auth/verify-email-otp/",
        {"email": "bad@example.com", "code": "000000"},
        format="json",
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_OTP"


@pytest.mark.django_db
def test_verify_email_otp_no_otp_issued_returns_400(client):
    res = client.post(
        "/api/auth/verify-email-otp/",
        {"email": "ghost@example.com", "code": "123456"},
        format="json",
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "OTP_EXPIRED"
```

- [ ] **Step 5: Run endpoint tests**

```bash
cd backend && python -m pytest apps/accounts/tests/test_email_otp_views.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Run the full accounts test suite**

```bash
cd backend && python -m pytest apps/accounts/ -v
```

Expected: all tests PASS (no regressions).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_email_otp_views.py
git commit -m "feat: add request-email-otp and verify-email-otp endpoints"
```

---

## Task 5: Frontend — API types, client methods, and hooks

**Files:**
- Modify: `frontend/packages/api/src/customer/types.ts`
- Modify: `frontend/packages/api/src/customer/api.ts`
- Modify: `frontend/packages/api/src/customer/hooks.ts`

- [ ] **Step 1: Update types.ts**

In `frontend/packages/api/src/customer/types.ts`:

1. Make `phone` nullable in the `User` type and add `is_email_verified`:

```typescript
export type User = {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  role: Role;
  is_phone_verified: boolean;
  is_email_verified: boolean;
  avatar: string | null;
  avatar_emoji: string;
};
```

2. Add new payload types before the `// ---- request payloads ----` comment:

```typescript
export type RequestEmailOtpPayload = {
  email: string;
  name: string;
  password: string;
  phone?: string;
};

export type EmailOtpResult = AuthResult;
```

- [ ] **Step 2: Update CustomerApi interface in api.ts**

Add the import at the top of the existing imports block in `frontend/packages/api/src/customer/api.ts`:

```typescript
import type {
  // ... all existing imports ...
  RequestEmailOtpPayload,
  EmailOtpResult,
} from "./types";
```

Add two methods to the `CustomerApi` interface after `passwordLogin`:

```typescript
requestEmailOtp(payload: RequestEmailOtpPayload): Promise<RequestOtpResult>;
verifyEmailOtp(email: string, code: string): Promise<EmailOtpResult>;
```

Add the implementations to the `customerApi` object after `passwordLogin`:

```typescript
requestEmailOtp: (payload) =>
  api.post<RequestOtpResult>("/api/auth/request-email-otp/", payload, { auth: false }),

verifyEmailOtp: async (email, code) => {
  const res = await api.post<EmailOtpResult>(
    "/api/auth/verify-email-otp/",
    { email, code },
    { auth: false },
  );
  tokenStore.set(res.access, res.refresh);
  session.setUserId(res.user.id);
  return res;
},
```

- [ ] **Step 3: Add hooks to hooks.ts**

Update the import at the top of `frontend/packages/api/src/customer/hooks.ts`:

```typescript
import type { CampaignListParams, NearbyParams, ProfilePatch, RequestEmailOtpPayload } from "./types";
```

Add two new hooks after `usePasswordLogin`:

```typescript
export const useRequestEmailOtp = () =>
  useMutation({
    mutationFn: (payload: RequestEmailOtpPayload) => customerApi.requestEmailOtp(payload),
  });

export const useVerifyEmailOtp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) =>
      customerApi.verifyEmailOtp(email, code),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
};
```

- [ ] **Step 4: Run typecheck**

```bash
cd frontend && pnpm --filter @jaqyn/api typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/api/src/customer/types.ts frontend/packages/api/src/customer/api.ts frontend/packages/api/src/customer/hooks.ts
git commit -m "feat: add email OTP API methods, hooks, and updated User type"
```

---

## Task 6: i18n keys

**Files:**
- Modify: `frontend/packages/i18n/src/locales.ts`

- [ ] **Step 1: Add signup keys to the ru locale**

In the `ru` object, add after the last `auth.*` key (`"auth.unified.subtitle"`):

```typescript
"auth.noAccount": "Нет аккаунта?",
"signup.title": "Создать аккаунт",
"signup.subtitle": "Выберите способ регистрации",
"signup.option.phone": "Номер телефона",
"signup.option.email": "Email",
"signup.option.google": "Продолжить с Google",
"signup.option.apple": "Продолжить с Apple",
"signup.haveAccount": "Уже есть аккаунт?",
"signup.signIn": "Войти",
"signup.email.title": "Регистрация по Email",
"signup.email.name": "Имя",
"signup.email.namePlaceholder": "Ваше имя",
"signup.email.password": "Пароль",
"signup.email.phone": "Телефон (необязательно)",
"signup.email.submit": "Получить код",
"signup.verify.title": "Введите код",
"signup.verify.subtitle": "Мы отправили код на",
"signup.verify.submit": "Подтвердить",
"signup.verify.resend": "Отправить снова",
"signup.verify.resendIn": "Повторить через {n}с",
```

- [ ] **Step 2: Add signup keys to the en locale**

In the `en` object, add after the last `auth.*` key (`"auth.unified.subtitle"`):

```typescript
"auth.noAccount": "Don't have an account?",
"signup.title": "Create account",
"signup.subtitle": "Choose how you'd like to sign up",
"signup.option.phone": "Phone number",
"signup.option.email": "Email address",
"signup.option.google": "Continue with Google",
"signup.option.apple": "Continue with Apple",
"signup.haveAccount": "Already have an account?",
"signup.signIn": "Sign in",
"signup.email.title": "Sign up with Email",
"signup.email.name": "Full name",
"signup.email.namePlaceholder": "Your name",
"signup.email.password": "Password",
"signup.email.phone": "Phone (optional)",
"signup.email.submit": "Send code",
"signup.verify.title": "Enter your code",
"signup.verify.subtitle": "We sent a 6-digit code to",
"signup.verify.submit": "Verify",
"signup.verify.resend": "Resend code",
"signup.verify.resendIn": "Resend in {n}s",
```

- [ ] **Step 3: Commit**

```bash
git add frontend/packages/i18n/src/locales.ts
git commit -m "feat: add signup and email OTP i18n keys"
```

---

## Task 7: Create signup entry page

**Files:**
- Create: `frontend/apps/web/app/signup/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const t = useT();
  const router = useRouter();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-4 py-10 font-sans text-ink sm:px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-24 -top-24 h-[42vw] max-h-[420px] min-h-[260px] w-[42vw] min-w-[260px] max-w-[420px] rounded-full bg-brand/25 blur-3xl"
          style={{ animation: "jqFloatA 14s ease-in-out infinite" }}
        />
        <div
          className="absolute -right-20 top-1/3 h-[36vw] max-h-[360px] min-h-[220px] w-[36vw] min-w-[220px] max-w-[360px] rounded-full bg-sage/20 blur-3xl"
          style={{ animation: "jqFloatB 18s ease-in-out infinite" }}
        />
      </div>

      <Link
        href="/"
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card/70 text-subtle backdrop-blur transition hover:text-brand sm:left-6 sm:top-6"
        aria-label="Back home"
      >
        ←
      </Link>

      <div className="relative z-10 w-full max-w-[420px] animate-[jqIn_.4s_ease]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand-gradient font-display text-3xl font-extrabold text-brand-fg shadow-glow">
            J
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink sm:text-[27px]">
            {t("signup.title")}
          </h1>
          <p className="mt-1.5 text-sm text-subtle">{t("signup.subtitle")}</p>
        </div>

        <div className="mt-6 rounded-[22px] border border-line bg-card/80 p-5 shadow-card backdrop-blur-sm sm:p-6">
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="flex items-center gap-3 rounded-xl border border-line bg-card/60 px-4 py-3.5 text-sm font-semibold text-ink transition hover:border-brand/40 hover:bg-brand/5"
            >
              <span className="text-xl">📱</span>
              {t("signup.option.phone")}
            </button>

            <button
              type="button"
              onClick={() => router.push("/signup/email")}
              className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3.5 text-sm font-semibold text-ink transition hover:border-brand/50 hover:bg-brand/10"
            >
              <span className="text-xl">✉️</span>
              {t("signup.option.email")}
            </button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
                or
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            {[
              { key: "google", label: t("signup.option.google"), glyph: "G" },
              { key: "apple", label: t("signup.option.apple"), glyph: "" },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                disabled
                title="Social sign-in is coming soon"
                className="flex cursor-not-allowed items-center justify-center gap-2.5 rounded-xl border border-line bg-card/60 py-3 text-sm font-semibold text-subtle"
              >
                <span className="font-display text-[15px]">{p.glyph}</span>
                {p.label}
                <span className="ml-1 rounded-full bg-board/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-subtle">
                  Soon
                </span>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-5 text-center text-[12.5px] text-subtle">
          {t("signup.haveAccount")}{" "}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            {t("signup.signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/apps/web/app/signup/page.tsx
git commit -m "feat: add signup entry page with method picker"
```

---

## Task 8: Create email signup page (multi-step)

**Files:**
- Create: `frontend/apps/web/app/signup/email/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useRequestEmailOtp, useVerifyEmailOtp } from "@jaqyn/api";
import type { AuthResult } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Input } from "@jaqyn/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useErrMessage } from "../../_lib/useErrMessage";

const RESEND_COOLDOWN_SECONDS = 60;

export default function EmailSignupPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();

  const [step, setStep] = useState<"form" | "verify">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const startResendTimer = () => {
    setResendSeconds(RESEND_COOLDOWN_SECONDS);
    timerRef.current = setInterval(() => {
      setResendSeconds((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const requestEmailOtp = useRequestEmailOtp();
  const verifyEmailOtp = useVerifyEmailOtp();

  const go = (r: AuthResult) => {
    if (r.area === "customer" && (r.is_new || r.onboarding_completed === false)) {
      router.replace("/onboarding");
      return;
    }
    router.replace("/");
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestEmailOtp.mutate(
      { email, name, password, phone: phone || undefined },
      {
        onSuccess: () => {
          setStep("verify");
          startResendTimer();
        },
      },
    );
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyEmailOtp.mutate({ email, code }, { onSuccess: (r) => go(r) });
  };

  const handleResend = () => {
    requestEmailOtp.mutate(
      { email, name, password, phone: phone || undefined },
      { onSuccess: () => startResendTimer() },
    );
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-4 py-10 font-sans text-ink sm:px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-24 -top-24 h-[42vw] max-h-[420px] min-h-[260px] w-[42vw] min-w-[260px] max-w-[420px] rounded-full bg-brand/25 blur-3xl"
          style={{ animation: "jqFloatA 14s ease-in-out infinite" }}
        />
        <div
          className="absolute -right-20 top-1/3 h-[36vw] max-h-[360px] min-h-[220px] w-[36vw] min-w-[220px] max-w-[360px] rounded-full bg-sage/20 blur-3xl"
          style={{ animation: "jqFloatB 18s ease-in-out infinite" }}
        />
      </div>

      <button
        type="button"
        onClick={() => (step === "verify" ? setStep("form") : router.back())}
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-card/70 text-subtle backdrop-blur transition hover:text-brand sm:left-6 sm:top-6"
        aria-label="Back"
      >
        ←
      </button>

      <div key={step} className="relative z-10 w-full max-w-[420px] animate-[jqIn_.4s_ease]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand-gradient font-display text-3xl font-extrabold text-brand-fg shadow-glow">
            J
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink sm:text-[27px]">
            {step === "form" ? t("signup.email.title") : t("signup.verify.title")}
          </h1>
          {step === "verify" && (
            <p className="mt-1.5 text-sm text-subtle">
              {t("signup.verify.subtitle")} <b className="text-ink">{email}</b>
            </p>
          )}
        </div>

        <div className="mt-6 rounded-[22px] border border-line bg-card/80 p-5 shadow-card backdrop-blur-sm sm:p-6">
          {step === "form" ? (
            <form className="flex flex-col gap-4" onSubmit={handleFormSubmit}>
              <Input
                label={t("signup.email.name")}
                type="text"
                autoComplete="name"
                placeholder={t("signup.email.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                label={t("auth.email")}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label={t("signup.email.password")}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <Input
                label={t("signup.email.phone")}
                type="tel"
                inputMode="tel"
                placeholder={t("auth.phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {requestEmailOtp.isError && (
                <p className="text-sm text-danger">{errMessage(requestEmailOtp.error)}</p>
              )}
              <Button
                type="submit"
                disabled={requestEmailOtp.isPending || !name || !email || password.length < 8}
              >
                {requestEmailOtp.isPending ? t("common.loading") : t("signup.email.submit")}
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleVerifySubmit}>
              <Input
                label={t("auth.enterCode")}
                type="tel"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              {verifyEmailOtp.isError && (
                <p className="text-sm text-danger">{errMessage(verifyEmailOtp.error)}</p>
              )}
              <Button type="submit" disabled={verifyEmailOtp.isPending || code.length < 6}>
                {verifyEmailOtp.isPending ? t("common.loading") : t("signup.verify.submit")}
              </Button>
              <button
                type="button"
                disabled={resendSeconds > 0 || requestEmailOtp.isPending}
                onClick={handleResend}
                className="text-sm font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendSeconds > 0
                  ? t("signup.verify.resendIn").replace("{n}", String(resendSeconds))
                  : t("signup.verify.resend")}
              </button>
            </form>
          )}
        </div>

        {step === "form" && (
          <p className="mt-5 text-center text-[12.5px] text-subtle">
            {t("signup.haveAccount")}{" "}
            <Link href="/login" className="font-semibold text-brand hover:underline">
              {t("signup.signIn")}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/apps/web/app/signup/email/page.tsx
git commit -m "feat: add email signup multi-step page with OTP verify and resend"
```

---

## Task 9: Add sign-up link to login page

**Files:**
- Modify: `frontend/apps/web/app/login/page.tsx`
- Modify: `frontend/packages/i18n/src/locales.ts` (already done in Task 6 — `auth.noAccount` key)

- [ ] **Step 1: Add sign-up link to login/page.tsx**

Find the closing paragraph at the bottom of the `LoginFlow` component:

```tsx
<p className="mt-5 text-center text-[12.5px] text-subtle">Google &amp; other social sign-in are coming soon.</p>
```

Replace it with:

```tsx
<p className="mt-5 text-center text-[12.5px] text-subtle">Google &amp; other social sign-in are coming soon.</p>
<p className="mt-2 text-center text-[12.5px] text-subtle">
  {t("auth.noAccount")}{" "}
  <Link href="/signup" className="font-semibold text-brand hover:underline">
    {t("auth.signup")}
  </Link>
</p>
```

- [ ] **Step 2: Run typecheck on the web app**

```bash
cd frontend && pnpm --filter web typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/apps/web/app/login/page.tsx
git commit -m "feat: add sign-up link to login page"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && python -m pytest apps/accounts/ -v
```

Expected: all tests PASS.

- [ ] **Step 2: Run frontend typecheck**

```bash
cd frontend && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Start the dev stack and verify the email in Mailpit**

In one terminal:
```bash
cd backend && python manage.py runserver
```

In another:
```bash
cd frontend && pnpm dev
```

Navigate to `http://localhost:3000/signup`. Click "Email address". Fill in name, email, password. Submit. Check `http://localhost:8025` (Mailpit) for the OTP email. Enter the code. Confirm redirect to `/onboarding`.

- [ ] **Step 4: Verify resend timer**

On the OTP screen, confirm the resend button shows a countdown and becomes clickable after 60 seconds.

- [ ] **Step 5: Verify login page sign-up link**

Navigate to `http://localhost:3000/login`. Confirm "Don't have an account? Sign up" link is visible and routes to `/signup`.
