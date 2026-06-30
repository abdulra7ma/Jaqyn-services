---
title: Password Reset + Phone Profile Completion Implementation Plan
service: shared
type: spec
status: deprecated
last_reviewed: 2026-06-30
---
# Password Reset + Phone Profile Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (A) email-code password reset with auto-login, and (B) a persisted profile-completion gate that forces new phone-signup customers to enter their name before reaching the app.

**Architecture:** Both reuse the existing email-OTP pattern (6-digit code + payload in Redis cache keyed by email, `OTP_TTL_SECONDS` TTL, rate-limited via `core.ratelimit.hit_limit`, emailed via a Celery `send_mail` task, errors raised as `JaqynAPIException`). Part B adds a `CustomerProfile.profile_completed` boolean parallel to the existing `onboarding_completed`, surfaced in the auth payload + `/me`, and consumed by a shared frontend routing helper.

**Tech Stack:** Django 5 / DRF / Redis cache / Celery / Django email backend. Next.js 14 App Router / TanStack Query 5 / `@jaqyn/api` / `@jaqyn/i18n` / Tailwind / Vitest.

**Branch:** `feat/email-signup-otp` (already checked out; extends shipped email-signup work). Backend commands run via: `cd backend && source ../.venv/bin/activate`.

---

## File Map

**Backend — create:**
- `backend/apps/accounts/migrations/0005_customerprofile_profile_completed.py`
- `backend/apps/accounts/tests/test_password_reset_service.py`
- `backend/apps/accounts/tests/test_password_reset_views.py`
- `backend/apps/accounts/tests/test_profile_completion.py`

**Backend — modify:**
- `backend/apps/accounts/tasks.py` — `send_password_reset_otp_task`
- `backend/apps/accounts/services.py` — `issue_password_reset_otp`, `reset_password`, `verify_email_otp` tweak
- `backend/apps/accounts/serializers.py` — `RequestPasswordResetSerializer`, `ResetPasswordSerializer`
- `backend/apps/accounts/views.py` — two reset views, `_profile_done`, `_auth_payload`, `MeView`, `ProfileView`
- `backend/apps/accounts/urls.py` — two routes
- `backend/apps/accounts/models.py` — `CustomerProfile.profile_completed`

**Frontend — create:**
- `frontend/apps/web/app/forgot-password/page.tsx`
- `frontend/apps/web/app/signup/complete/page.tsx`
- `frontend/apps/web/app/_lib/postAuthRoute.ts` (+ `postAuthRoute.test.ts`)

**Frontend — modify:**
- `frontend/packages/api/src/customer/types.ts`
- `frontend/packages/api/src/customer/api.ts`
- `frontend/packages/api/src/customer/hooks.ts`
- `frontend/packages/i18n/src/locales.ts`
- `frontend/apps/web/app/login/page.tsx`
- `frontend/apps/web/app/signup/email/page.tsx`

---

# PART A — Password Reset

## Task 1: Password reset Celery task

**Files:**
- Modify: `backend/apps/accounts/tasks.py`

- [ ] **Step 1: Add the task after `send_email_otp_task`**

Append to `backend/apps/accounts/tasks.py`:

```python
@shared_task(max_retries=3, default_retry_delay=5, time_limit=30)
def send_password_reset_otp_task(email: str, code: str) -> None:
    """Send a 6-digit password-reset code to the given email via Django's email backend."""
    expiry_minutes = getattr(settings, "OTP_TTL_SECONDS", 300) // 60
    send_mail(
        subject="Your Jaqyn password reset code",
        message=(
            f"Your password reset code is: {code}\n\n"
            f"This code expires in {expiry_minutes} minutes.\n"
            f"If you did not request this, you can ignore this email."
        ),
        html_message=(
            f"<p>Your Jaqyn password reset code is:</p>"
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
git commit -m "feat: add send_password_reset_otp_task Celery task"
```

---

## Task 2: Password reset service functions (TDD)

**Files:**
- Modify: `backend/apps/accounts/services.py`
- Create: `backend/apps/accounts/tests/test_password_reset_service.py`

- [ ] **Step 1: Write failing tests**

Create `backend/apps/accounts/tests/test_password_reset_service.py`:

```python
import pytest
from unittest.mock import patch
from django.core.cache import cache

from apps.accounts.models import User
from apps.accounts.services import issue_password_reset_otp, reset_password
from core.exceptions import JaqynAPIException


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def _make_user(email="user@example.com", password="oldpassword"):
    user = User.objects.create(email=email, name="Alice", role=User.Role.CUSTOMER)
    user.set_password(password)
    user.save()
    return user


def _issue(email="user@example.com", ip="1.2.3.4"):
    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay") as delay:
        issue_password_reset_otp(email=email, ip_address=ip)
        return delay


@pytest.mark.django_db
def test_issue_stores_code_and_sends_email_for_existing_user():
    _make_user()
    delay = _issue()
    payload = cache.get("pwreset_otp:user@example.com")
    assert payload is not None
    assert len(payload["code"]) == 6
    delay.assert_called_once()


@pytest.mark.django_db
def test_issue_for_unknown_email_returns_without_raising_and_sends_nothing():
    # No account enumeration: the call must succeed silently and not email anyone.
    delay = _issue(email="ghost@example.com")
    assert cache.get("pwreset_otp:ghost@example.com") is None
    delay.assert_not_called()


@pytest.mark.django_db
def test_issue_normalizes_email_case():
    _make_user(email="mixed@example.com")
    _issue(email="Mixed@Example.com")
    assert cache.get("pwreset_otp:mixed@example.com") is not None


@pytest.mark.django_db
def test_issue_rate_limits_by_email():
    _make_user()
    for _ in range(3):
        _issue()
    with pytest.raises(JaqynAPIException) as exc:
        _issue()
    assert exc.value.code == "RATE_LIMITED"


@pytest.mark.django_db
def test_reset_password_success_sets_password_and_returns_tokens():
    user = _make_user(password="oldpassword")
    _issue()
    code = cache.get("pwreset_otp:user@example.com")["code"]
    returned_user, access, refresh = reset_password("user@example.com", code, "newpassword123")
    assert returned_user.id == user.id
    assert access
    assert refresh
    user.refresh_from_db()
    assert user.check_password("newpassword123")
    assert not user.check_password("oldpassword")


@pytest.mark.django_db
def test_reset_password_clears_cache_on_success():
    _make_user()
    _issue()
    code = cache.get("pwreset_otp:user@example.com")["code"]
    reset_password("user@example.com", code, "newpassword123")
    assert cache.get("pwreset_otp:user@example.com") is None


@pytest.mark.django_db
def test_reset_password_wrong_code_raises_invalid():
    _make_user()
    _issue()
    with pytest.raises(JaqynAPIException) as exc:
        reset_password("user@example.com", "000000", "newpassword123")
    assert exc.value.code == "INVALID_OTP"


@pytest.mark.django_db
def test_reset_password_no_code_issued_raises_expired():
    _make_user()
    with pytest.raises(JaqynAPIException) as exc:
        reset_password("user@example.com", "123456", "newpassword123")
    assert exc.value.code == "OTP_EXPIRED"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && source ../.venv/bin/activate && python -m pytest apps/accounts/tests/test_password_reset_service.py -v 2>&1 | head -20
```

Expected: `ImportError: cannot import name 'issue_password_reset_otp'`.

- [ ] **Step 3: Add the service functions**

In `backend/apps/accounts/services.py`, update the task import line:

```python
from apps.accounts.tasks import send_email_otp_task, send_otp, send_password_reset_otp_task
```

Then add these functions after `reset_password`'s intended location — i.e. after `verify_email_otp` and before `resolve_area`:

```python
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

    Reads the cached code for the (lowercased) email. Missing → OTP_EXPIRED.
    Counts attempts; >5 → RATE_LIMITED. Wrong code → INVALID_OTP. On success sets
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && source ../.venv/bin/activate && python -m pytest apps/accounts/tests/test_password_reset_service.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/accounts/services.py backend/apps/accounts/tests/test_password_reset_service.py
git commit -m "feat: add issue_password_reset_otp and reset_password service functions"
```

---

## Task 3: Password reset serializers, views, URLs

**Files:**
- Modify: `backend/apps/accounts/serializers.py`
- Modify: `backend/apps/accounts/views.py`
- Modify: `backend/apps/accounts/urls.py`
- Create: `backend/apps/accounts/tests/test_password_reset_views.py`

- [ ] **Step 1: Add serializers**

Append to `backend/apps/accounts/serializers.py`:

```python
class RequestPasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)
    new_password = serializers.CharField(min_length=8, max_length=128)
```

- [ ] **Step 2: Add views**

In `backend/apps/accounts/views.py`, update the serializer import block to add the two new names:

```python
from apps.accounts.serializers import (
    CustomerProfileSerializer,
    PasswordLoginSerializer,
    ProfileUpdateSerializer,
    RequestEmailOTPSerializer,
    RequestOTPSerializer,
    RequestPasswordResetSerializer,
    ResetPasswordSerializer,
    UserSerializer,
    VerifyEmailOTPSerializer,
    VerifyOTPSerializer,
)
```

Update the services import line to add the two new functions:

```python
from apps.accounts.services import (
    authenticate_password,
    issue_email_otp,
    issue_otp,
    issue_password_reset_otp,
    reset_password,
    resolve_area,
    verify_email_otp,
    verify_otp,
)
```

Add these two views after `PasswordLoginView` (and before `LogoutView`):

```python
class RequestPasswordResetView(APIView):
    permission_classes = [AllowAny]  # Public — anyone can request a reset code

    def post(self, request):
        serializer = RequestPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        issue_password_reset_otp(serializer.validated_data["email"], request_ip(request))
        # Always the same response — never reveal whether the account exists.
        return success_response({"message": "If the account exists, a reset code was sent."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]  # Public — completes reset with the emailed code

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, access, refresh = reset_password(
            serializer.validated_data["email"],
            serializer.validated_data["code"],
            serializer.validated_data["new_password"],
        )
        return success_response(_auth_payload(user, access, refresh))
```

- [ ] **Step 3: Add URL routes**

In `backend/apps/accounts/urls.py`, add the two view imports to the existing import block and add the two routes after `login-password/`:

```python
from apps.accounts.views import (
    AvatarUploadView,
    LogoutView,
    MeView,
    PasswordLoginView,
    ProfileView,
    RequestEmailOTPView,
    RequestOTPView,
    RequestPasswordResetView,
    ResetPasswordView,
    VerifyEmailOTPView,
    VerifyOTPView,
)
```

Add to `urlpatterns` after the `login-password/` line:

```python
    path("request-password-reset/", RequestPasswordResetView.as_view(), name="request-password-reset"),
    path("reset-password/", ResetPasswordView.as_view(), name="reset-password"),
```

- [ ] **Step 4: Write endpoint tests**

Create `backend/apps/accounts/tests/test_password_reset_views.py`:

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


def _make_user(email="user@example.com", password="oldpassword"):
    user = User.objects.create(email=email, name="Alice", role=User.Role.CUSTOMER)
    user.set_password(password)
    user.save()
    return user


@pytest.mark.django_db
def test_request_reset_known_email_returns_200(client):
    _make_user()
    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay"):
        res = client.post("/api/auth/request-password-reset/", {"email": "user@example.com"}, format="json")
    assert res.status_code == 200


@pytest.mark.django_db
def test_request_reset_unknown_email_same_response_no_enumeration(client):
    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay") as delay:
        res = client.post("/api/auth/request-password-reset/", {"email": "ghost@example.com"}, format="json")
    assert res.status_code == 200
    delay.assert_not_called()
    assert cache.get("pwreset_otp:ghost@example.com") is None


@pytest.mark.django_db
def test_request_reset_no_auth_required(client):
    res = client.post("/api/auth/request-password-reset/", {"email": "anon@example.com"}, format="json")
    assert res.status_code == 200


@pytest.mark.django_db
def test_reset_password_success_returns_jwt(client):
    _make_user(password="oldpassword")
    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay"):
        client.post("/api/auth/request-password-reset/", {"email": "user@example.com"}, format="json")
    code = cache.get("pwreset_otp:user@example.com")["code"]
    res = client.post(
        "/api/auth/reset-password/",
        {"email": "user@example.com", "code": code, "new_password": "newpassword123"},
        format="json",
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert "access" in data
    assert "refresh" in data
    assert data["user"]["email"] == "user@example.com"


@pytest.mark.django_db
def test_reset_password_wrong_code_returns_400(client):
    _make_user()
    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay"):
        client.post("/api/auth/request-password-reset/", {"email": "user@example.com"}, format="json")
    res = client.post(
        "/api/auth/reset-password/",
        {"email": "user@example.com", "code": "000000", "new_password": "newpassword123"},
        format="json",
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_OTP"


@pytest.mark.django_db
def test_reset_password_short_password_returns_400(client):
    res = client.post(
        "/api/auth/reset-password/",
        {"email": "user@example.com", "code": "123456", "new_password": "short"},
        format="json",
    )
    assert res.status_code == 400
```

- [ ] **Step 5: Run endpoint tests**

```bash
cd backend && source ../.venv/bin/activate && python -m pytest apps/accounts/tests/test_password_reset_views.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/urls.py backend/apps/accounts/tests/test_password_reset_views.py
git commit -m "feat: add request-password-reset and reset-password endpoints"
```

---

## Task 4: Frontend API layer for password reset

**Files:**
- Modify: `frontend/packages/api/src/customer/types.ts`
- Modify: `frontend/packages/api/src/customer/api.ts`
- Modify: `frontend/packages/api/src/customer/hooks.ts`

- [ ] **Step 1: Add result type**

In `frontend/packages/api/src/customer/types.ts`, after the existing `export type PasswordLoginResult = AuthResult;` line, add:

```typescript
export type ResetPasswordResult = AuthResult;
```

- [ ] **Step 2: Add interface methods + implementations**

In `frontend/packages/api/src/customer/api.ts`, add to the type import block (alongside the existing imports from `./types`):

```typescript
  ResetPasswordResult,
```

Add to the `CustomerApi` interface, right after the `passwordLogin(...)` line:

```typescript
  requestPasswordReset(email: string): Promise<{ message: string }>;
  resetPassword(email: string, code: string, newPassword: string): Promise<ResetPasswordResult>;
```

Add to the `customerApi` object, right after the `passwordLogin` implementation:

```typescript
  requestPasswordReset: (email) =>
    api.post<{ message: string }>("/api/auth/request-password-reset/", { email }, { auth: false }),
  resetPassword: async (email, code, new_password) => {
    const res = await api.post<ResetPasswordResult>(
      "/api/auth/reset-password/",
      { email, code, new_password },
      { auth: false },
    );
    tokenStore.set(res.access, res.refresh);
    session.setUserId(res.user.id);
    return res;
  },
```

- [ ] **Step 3: Add hooks**

In `frontend/packages/api/src/customer/hooks.ts`, add after the `usePasswordLogin` hook:

```typescript
export const useRequestPasswordReset = () =>
  useMutation({ mutationFn: (email: string) => customerApi.requestPasswordReset(email) });

export const useResetPassword = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, code, newPassword }: { email: string; code: string; newPassword: string }) =>
      customerApi.resetPassword(email, code, newPassword),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
};
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && pnpm --filter @jaqyn/api typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/api/src/customer/types.ts frontend/packages/api/src/customer/api.ts frontend/packages/api/src/customer/hooks.ts
git commit -m "feat: add password reset API methods and hooks"
```

---

## Task 5: i18n keys for password reset

**Files:**
- Modify: `frontend/packages/i18n/src/locales.ts`

- [ ] **Step 1: Add keys to the ru locale**

In the `ru` object, after the last `auth.*` key (find `"auth.unified.subtitle"` and any `signup.*` block), add:

```typescript
    "auth.forgotLink": "Забыли пароль?",
    "auth.forgot.title": "Сброс пароля",
    "auth.forgot.subtitle": "Введите email — пришлём код для сброса",
    "auth.forgot.emailSubmit": "Отправить код",
    "auth.forgot.codeTitle": "Новый пароль",
    "auth.forgot.codeSentTo": "Код отправлен на",
    "auth.forgot.code": "Код из письма",
    "auth.forgot.newPassword": "Новый пароль",
    "auth.forgot.submit": "Сбросить пароль",
    "auth.forgot.resend": "Отправить снова",
    "auth.forgot.resendIn": "Повторить через {n}с",
    "auth.forgot.backToLogin": "Вернуться ко входу",
```

- [ ] **Step 2: Add keys to the en locale**

In the `en` object, at the matching position, add:

```typescript
    "auth.forgotLink": "Forgot password?",
    "auth.forgot.title": "Reset your password",
    "auth.forgot.subtitle": "Enter your email and we'll send a reset code",
    "auth.forgot.emailSubmit": "Send code",
    "auth.forgot.codeTitle": "Set a new password",
    "auth.forgot.codeSentTo": "Code sent to",
    "auth.forgot.code": "Code from email",
    "auth.forgot.newPassword": "New password",
    "auth.forgot.submit": "Reset password",
    "auth.forgot.resend": "Resend code",
    "auth.forgot.resendIn": "Resend in {n}s",
    "auth.forgot.backToLogin": "Back to sign in",
```

- [ ] **Step 3: Commit**

```bash
git add frontend/packages/i18n/src/locales.ts
git commit -m "feat: add password reset i18n keys"
```

---

## Task 6: Forgot-password page + login link

**Files:**
- Create: `frontend/apps/web/app/forgot-password/page.tsx`
- Modify: `frontend/apps/web/app/login/page.tsx`

- [ ] **Step 1: Create the forgot-password page**

Create `frontend/apps/web/app/forgot-password/page.tsx`:

```tsx
"use client";

import { useRequestPasswordReset, useResetPassword } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Input } from "@jaqyn/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useErrMessage } from "../_lib/useErrMessage";

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();

  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
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

  const requestReset = useRequestPasswordReset();
  const resetPassword = useResetPassword();

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestReset.mutate(email, {
      onSuccess: () => {
        setStep("reset");
        startResendTimer();
      },
    });
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Reset returns an auth payload and logs the user in — send them to the app.
    resetPassword.mutate(
      { email, code, newPassword },
      { onSuccess: () => router.replace("/") },
    );
  };

  const handleResend = () => {
    requestReset.mutate(email, { onSuccess: () => startResendTimer() });
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
        onClick={() => (step === "reset" ? setStep("email") : router.push("/login"))}
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
            {step === "email" ? t("auth.forgot.title") : t("auth.forgot.codeTitle")}
          </h1>
          <p className="mt-1.5 text-sm text-subtle">
            {step === "email" ? (
              t("auth.forgot.subtitle")
            ) : (
              <>
                {t("auth.forgot.codeSentTo")} <b className="text-ink">{email}</b>
              </>
            )}
          </p>
        </div>

        <div className="mt-6 rounded-[22px] border border-line bg-card/80 p-5 shadow-card backdrop-blur-sm sm:p-6">
          {step === "email" ? (
            <form className="flex flex-col gap-4" onSubmit={handleEmailSubmit}>
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
              {requestReset.isError && (
                <p className="text-sm text-danger">{errMessage(requestReset.error)}</p>
              )}
              <Button type="submit" disabled={requestReset.isPending || !email}>
                {requestReset.isPending ? t("common.loading") : t("auth.forgot.emailSubmit")}
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleResetSubmit}>
              <Input
                label={t("auth.forgot.code")}
                type="tel"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              <Input
                label={t("auth.forgot.newPassword")}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
              {resetPassword.isError && (
                <p className="text-sm text-danger">{errMessage(resetPassword.error)}</p>
              )}
              <Button
                type="submit"
                disabled={resetPassword.isPending || code.length < 6 || newPassword.length < 8}
              >
                {resetPassword.isPending ? t("common.loading") : t("auth.forgot.submit")}
              </Button>
              <button
                type="button"
                disabled={resendSeconds > 0 || requestReset.isPending}
                onClick={handleResend}
                className="text-sm font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendSeconds > 0
                  ? t("auth.forgot.resendIn").replace("{n}", String(resendSeconds))
                  : t("auth.forgot.resend")}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-[12.5px] text-subtle">
          <Link href="/login" className="font-semibold text-brand hover:underline">
            {t("auth.forgot.backToLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the "Forgot password?" link to the login page**

In `frontend/apps/web/app/login/page.tsx`, find the email+password form (the `<form>` whose submit calls `passwordLogin.mutate`). Inside it, immediately after the password `<Input ... />` for `password` and before the `{passwordLogin.isError && ...}` line, insert:

```tsx
                <div className="-mt-1 flex justify-end">
                  <Link href="/forgot-password" className="text-xs font-semibold text-brand hover:underline">
                    {t("auth.forgotLink")}
                  </Link>
                </div>
```

(`Link` is already imported in this file.)

- [ ] **Step 3: Typecheck the web app**

```bash
cd frontend && pnpm --filter web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/app/forgot-password/page.tsx frontend/apps/web/app/login/page.tsx
git commit -m "feat: add forgot-password page and login link"
```

---

# PART B — Phone Signup Profile Completion

## Task 7: profile_completed model field + migration + service wiring (TDD)

**Files:**
- Modify: `backend/apps/accounts/models.py`
- Create: `backend/apps/accounts/migrations/0005_customerprofile_profile_completed.py`
- Modify: `backend/apps/accounts/services.py`
- Create: `backend/apps/accounts/tests/test_profile_completion.py`

- [ ] **Step 1: Write failing tests**

Create `backend/apps/accounts/tests/test_profile_completion.py`:

```python
import pytest
from unittest.mock import patch
from django.core.cache import cache

from apps.accounts.models import CustomerProfile, User
from apps.accounts.services import issue_email_otp, verify_email_otp, verify_otp


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_phone_signup_new_user_profile_not_completed():
    with patch("apps.accounts.tasks.send_otp.delay"):
        user, is_new, _, _ = verify_otp("+996700111222", "123456")  # DEV_LOGIN_OTP path in tests
    assert is_new is True
    assert user.customer_profile.profile_completed is False


@pytest.mark.django_db
def test_email_signup_new_user_profile_completed():
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        issue_email_otp(
            email="e@example.com", name="Eve", password="password123", phone=None, ip_address="1.1.1.1"
        )
    code = cache.get("email_otp:e@example.com")["code"]
    user, is_new, _, _ = verify_email_otp("e@example.com", code)
    assert is_new is True
    assert user.customer_profile.profile_completed is True
```

NOTE: `verify_otp` uses `settings.DEV_LOGIN_OTP` to accept a static code in tests. Confirm the test settings define `DEV_LOGIN_OTP = "123456"`; if not, set the OTP through the cache instead by calling `issue_otp` and reading `cache.get("otp:+996700111222")["code"]`. Check `backend/config/settings/` (or `core/settings`) and the existing `test_email_otp_service.py` for how OTP tests are written, and mirror that exact approach. Adapt the first test to whatever the established phone-OTP test pattern is — do not invent a new one.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && source ../.venv/bin/activate && python -m pytest apps/accounts/tests/test_profile_completion.py -v 2>&1 | head -20
```

Expected: FAIL — `AttributeError: ... no attribute 'profile_completed'` (field doesn't exist yet).

- [ ] **Step 3: Add the model field**

In `backend/apps/accounts/models.py`, in `CustomerProfile`, add after the `onboarding_completed` field:

```python
    # Required signup info (name) supplied. Persisted so the completion gate
    # survives relogin/reinstall, like onboarding_completed. Email signups set
    # this True at creation; new phone signups start False and must fill the form.
    profile_completed = models.BooleanField(default=False)
```

- [ ] **Step 4: Generate the migration**

```bash
cd backend && source ../.venv/bin/activate && python manage.py makemigrations accounts --name customerprofile_profile_completed
```

Expected: creates `apps/accounts/migrations/0005_customerprofile_profile_completed.py` depending on `0004_user_email_otp`.

- [ ] **Step 5: Apply the migration**

```bash
cd backend && source ../.venv/bin/activate && python manage.py migrate accounts
```

Expected: `Applying accounts.0005_customerprofile_profile_completed... OK`. (If the live DB runs in Docker, also run it there per the project's migration process — note any untested step as a concern.)

- [ ] **Step 6: Set profile_completed on email signup**

In `backend/apps/accounts/services.py`, inside `verify_email_otp`, replace the profile-creation line:

```python
    if user.role == User.Role.CUSTOMER:
        CustomerProfile.objects.get_or_create(user=user)
```

with a version that marks the gate done for newly-created email users (who supplied name + email):

```python
    if user.role == User.Role.CUSTOMER:
        profile, _ = CustomerProfile.objects.get_or_create(user=user)
        # Email signups arrive with name + email already, so the completion gate
        # is satisfied at creation. Only flip it for new users — never re-open it
        # for a returning user who may have intentionally left it as-is.
        if is_new and not profile.profile_completed:
            profile.profile_completed = True
            profile.save(update_fields=["profile_completed", "updated_at"])
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd backend && source ../.venv/bin/activate && python -m pytest apps/accounts/tests/test_profile_completion.py -v
```

Expected: both tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/accounts/models.py backend/apps/accounts/migrations/0005_customerprofile_profile_completed.py backend/apps/accounts/services.py backend/apps/accounts/tests/test_profile_completion.py
git commit -m "feat: add profile_completed flag, set it on email signup"
```

---

## Task 8: Expose profile_completed in auth payload, /me, and profile PATCH

**Files:**
- Modify: `backend/apps/accounts/views.py`
- Modify: `backend/apps/accounts/tests/test_profile_completion.py`

- [ ] **Step 1: Add failing tests**

Append to `backend/apps/accounts/tests/test_profile_completion.py`:

```python
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_auth_payload_includes_profile_completed():
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        issue_email_otp(
            email="p@example.com", name="Pat", password="password123", phone=None, ip_address="1.1.1.1"
        )
    code = cache.get("email_otp:p@example.com")["code"]
    client = APIClient()
    res = client.post("/api/auth/verify-email-otp/", {"email": "p@example.com", "code": code}, format="json")
    assert res.status_code == 200
    assert res.json()["data"]["profile_completed"] is True


@pytest.mark.django_db
def test_profile_patch_with_name_sets_profile_completed():
    user = User.objects.create(phone="+996700333444", role=User.Role.CUSTOMER)
    CustomerProfile.objects.create(user=user, profile_completed=False)
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.patch("/api/auth/profile/", {"name": "Sam"}, format="json")
    assert res.status_code == 200
    user.customer_profile.refresh_from_db()
    assert user.customer_profile.profile_completed is True
    assert res.json()["data"]["profile"]["profile_completed"] is True


@pytest.mark.django_db
def test_me_includes_profile_completed():
    user = User.objects.create(phone="+996700555666", role=User.Role.CUSTOMER)
    CustomerProfile.objects.create(user=user, profile_completed=False)
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.get("/api/auth/me/")
    assert res.status_code == 200
    assert res.json()["data"]["profile"]["profile_completed"] is False
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend && source ../.venv/bin/activate && python -m pytest apps/accounts/tests/test_profile_completion.py -v 2>&1 | tail -20
```

Expected: the 3 new tests FAIL (`profile_completed` not in payload / not set by PATCH / not in serializer).

- [ ] **Step 3: Add profile_completed to CustomerProfileSerializer**

In `backend/apps/accounts/serializers.py`, update `CustomerProfileSerializer.Meta.fields` to include `profile_completed`:

```python
class CustomerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerProfile
        fields = ("birthday", "language", "marketing_opt_in", "onboarding_completed", "profile_completed")
```

- [ ] **Step 4: Add `_profile_done` and include it in `_auth_payload`**

In `backend/apps/accounts/views.py`, after the `_onboarding_done` helper add:

```python
def _profile_done(user):
    profile = getattr(user, "customer_profile", None)
    return bool(profile and profile.profile_completed)
```

Update `_auth_payload` to include the flag:

```python
def _auth_payload(user, access, refresh, **extra):
    return {
        "access": access,
        "refresh": refresh,
        "user": UserSerializer(user).data,
        "area": resolve_area(user),
        "onboarding_completed": _onboarding_done(user),
        "profile_completed": _profile_done(user),
        **extra,
    }
```

- [ ] **Step 5: Set profile_completed in ProfileView PATCH when name provided**

In `backend/apps/accounts/views.py` `ProfileView.patch`, update the profile-field loop block. Replace:

```python
        if profile is not None:
            for field in ("birthday", "language", "marketing_opt_in", "onboarding_completed"):
                if field in data:
                    setattr(profile, field, data[field])
            profile.save()
```

with:

```python
        if profile is not None:
            for field in ("birthday", "language", "marketing_opt_in", "onboarding_completed"):
                if field in data:
                    setattr(profile, field, data[field])
            # Supplying a non-empty name satisfies the required-info completion gate.
            if data.get("name"):
                profile.profile_completed = True
            profile.save()
```

(`MeView` already serializes the profile via `CustomerProfileSerializer`, so Step 3 covers `/me` automatically.)

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && source ../.venv/bin/activate && python -m pytest apps/accounts/tests/test_profile_completion.py -v
```

Expected: all tests PASS.

- [ ] **Step 7: Run the full accounts suite (no regressions)**

```bash
cd backend && source ../.venv/bin/activate && python -m pytest apps/accounts/ -v 2>&1 | tail -25
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/accounts/serializers.py backend/apps/accounts/views.py backend/apps/accounts/tests/test_profile_completion.py
git commit -m "feat: surface profile_completed in auth payload, /me, and profile PATCH"
```

---

## Task 9: Frontend types + shared post-auth routing helper (TDD)

**Files:**
- Modify: `frontend/packages/api/src/customer/types.ts`
- Create: `frontend/apps/web/app/_lib/postAuthRoute.ts`
- Create: `frontend/apps/web/app/_lib/postAuthRoute.test.ts`

- [ ] **Step 1: Add profile_completed to Me, CustomerProfile, and AuthResult types**

In `frontend/packages/api/src/customer/types.ts`:

Add `profile_completed: boolean;` to the `CustomerProfile` type:

```typescript
export type CustomerProfile = {
  birthday: string | null;
  language: Language;
  marketing_opt_in: boolean;
  onboarding_completed: boolean;
  profile_completed: boolean;
};
```

Add `profile_completed?: boolean;` to the `AuthResult` type (after `onboarding_completed`):

```typescript
export type AuthResult = {
  access: string;
  refresh: string;
  user: User;
  area: Area;
  is_new?: boolean;
  onboarding_completed?: boolean;
  profile_completed?: boolean;
};
```

- [ ] **Step 2: Write the failing helper test**

Create `frontend/apps/web/app/_lib/postAuthRoute.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { AuthResult } from "@jaqyn/api";
import { postAuthRoute } from "./postAuthRoute";

const base: AuthResult = {
  access: "a",
  refresh: "r",
  user: {
    id: "1",
    phone: null,
    name: null,
    email: null,
    role: "customer",
    is_phone_verified: false,
    is_email_verified: false,
    avatar: null,
    avatar_emoji: "",
  },
  area: "customer",
};

describe("postAuthRoute", () => {
  it("sends a customer with incomplete profile to /signup/complete (highest priority)", () => {
    const r = { ...base, profile_completed: false, onboarding_completed: false, is_new: true };
    expect(postAuthRoute(r, "/")).toBe("/signup/complete");
  });

  it("sends a customer with complete profile but unfinished onboarding to /onboarding", () => {
    const r = { ...base, profile_completed: true, onboarding_completed: false };
    expect(postAuthRoute(r, "/")).toBe("/onboarding?return=%2F");
  });

  it("sends a new customer (is_new) with complete profile to /onboarding", () => {
    const r = { ...base, profile_completed: true, is_new: true };
    expect(postAuthRoute(r, "/rewards")).toBe("/onboarding?return=%2Frewards");
  });

  it("sends a fully set-up customer to the return path", () => {
    const r = { ...base, profile_completed: true, onboarding_completed: true };
    expect(postAuthRoute(r, "/rewards")).toBe("/rewards");
  });

  it("sends a business user to the business console regardless of return", () => {
    const r = { ...base, area: "business" as const, profile_completed: false };
    expect(postAuthRoute(r, "/")).toBe("/business/dashboard");
  });

  it("sends a staff user to the staff console", () => {
    const r = { ...base, area: "staff" as const, profile_completed: false };
    expect(postAuthRoute(r, "/")).toBe("/staff");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd frontend && pnpm --filter web vitest run app/_lib/postAuthRoute.test.ts 2>&1 | tail -20
```

Expected: FAIL — cannot resolve `./postAuthRoute`.

- [ ] **Step 4: Create the helper**

Create `frontend/apps/web/app/_lib/postAuthRoute.ts`:

```typescript
import type { Area, AuthResult } from "@jaqyn/api";

/** Console landing page for owner/staff; customers fall through to the return URL. */
function areaPath(area: Area, returnTo: string): string {
  if (area === "business") return "/business/dashboard";
  if (area === "staff") return "/staff";
  return returnTo || "/";
}

/**
 * Where a user goes after any successful auth. Priority:
 *  1. customer with profile_completed === false → /signup/complete (fill required info)
 *  2. customer who is new or hasn't finished the tour → /onboarding
 *  3. otherwise → area console / return URL
 */
export function postAuthRoute(r: AuthResult, returnTo: string): string {
  if (r.area === "customer" && r.profile_completed === false) {
    return "/signup/complete";
  }
  if (r.area === "customer" && (r.is_new || r.onboarding_completed === false)) {
    return `/onboarding?return=${encodeURIComponent(returnTo)}`;
  }
  return areaPath(r.area, returnTo);
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd frontend && pnpm --filter web vitest run app/_lib/postAuthRoute.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/packages/api/src/customer/types.ts frontend/apps/web/app/_lib/postAuthRoute.ts frontend/apps/web/app/_lib/postAuthRoute.test.ts
git commit -m "feat: add profile_completed type and shared postAuthRoute helper"
```

---

## Task 10: Wire login + email-signup pages to postAuthRoute

**Files:**
- Modify: `frontend/apps/web/app/login/page.tsx`
- Modify: `frontend/apps/web/app/signup/email/page.tsx`

- [ ] **Step 1: Update login/page.tsx**

In `frontend/apps/web/app/login/page.tsx`:

Remove the local `areaPath` function (the `function areaPath(area: Area, returnTo: string) { ... }` block near the top).

Add this import near the other imports:

```typescript
import { postAuthRoute } from "../_lib/postAuthRoute";
```

Replace the `go` function body:

```tsx
  const go = (r: AuthResult) => {
    if (r.area === "customer" && (r.is_new || r.onboarding_completed === false)) {
      router.replace(`/onboarding?return=${encodeURIComponent(returnTo)}`);
      return;
    }
    router.replace(areaPath(r.area, returnTo));
  };
```

with:

```tsx
  const go = (r: AuthResult) => router.replace(postAuthRoute(r, returnTo));
```

If `Area` is now an unused import after removing `areaPath`, remove it from the import statement to keep the typecheck clean (keep `AuthResult`).

- [ ] **Step 2: Update signup/email/page.tsx**

In `frontend/apps/web/app/signup/email/page.tsx`:

Remove the local `areaPath` function block.

Add the import:

```typescript
import { postAuthRoute } from "../../_lib/postAuthRoute";
```

Replace the `go` function:

```tsx
  const go = (r: AuthResult) => {
    if (r.area === "customer" && (r.is_new || r.onboarding_completed === false)) {
      router.replace("/onboarding");
      return;
    }
    router.replace(areaPath(r.area, "/"));
  };
```

with:

```tsx
  const go = (r: AuthResult) => router.replace(postAuthRoute(r, "/"));
```

Remove `Area` from imports if it becomes unused (keep `AuthResult`).

- [ ] **Step 3: Typecheck**

```bash
cd frontend && pnpm --filter web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/web/app/login/page.tsx frontend/apps/web/app/signup/email/page.tsx
git commit -m "refactor: route post-auth via shared postAuthRoute helper"
```

---

## Task 11: profile-completion page + i18n

**Files:**
- Modify: `frontend/packages/i18n/src/locales.ts`
- Create: `frontend/apps/web/app/signup/complete/page.tsx`

- [ ] **Step 1: Add i18n keys (ru then en)**

In `frontend/packages/i18n/src/locales.ts`, in the `ru` object add (near the `signup.*` block):

```typescript
    "profile.complete.title": "Завершите профиль",
    "profile.complete.subtitle": "Расскажите немного о себе, чтобы продолжить",
    "profile.complete.name": "Имя",
    "profile.complete.namePlaceholder": "Ваше имя",
    "profile.complete.emailOptional": "Email (необязательно)",
    "profile.complete.birthdayOptional": "День рождения (необязательно)",
    "profile.complete.language": "Язык",
    "profile.complete.submit": "Продолжить",
```

In the `en` object add:

```typescript
    "profile.complete.title": "Complete your profile",
    "profile.complete.subtitle": "Tell us a little about yourself to continue",
    "profile.complete.name": "Full name",
    "profile.complete.namePlaceholder": "Your name",
    "profile.complete.emailOptional": "Email (optional)",
    "profile.complete.birthdayOptional": "Birthday (optional)",
    "profile.complete.language": "Language",
    "profile.complete.submit": "Continue",
```

- [ ] **Step 2: Create the completion page**

Create `frontend/apps/web/app/signup/complete/page.tsx`:

```tsx
"use client";

import { useMe, useUpdateProfile } from "@jaqyn/api";
import type { Language } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Input } from "@jaqyn/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRequireAuth } from "../../_lib/auth";
import { useErrMessage } from "../../_lib/useErrMessage";

const LANGS: Language[] = ["ru", "en", "ky"];

export default function CompleteProfilePage() {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();
  const { isAuthenticated, ready } = useRequireAuth();
  const me = useMe(ready && isAuthenticated);
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthday, setBirthday] = useState("");
  const [language, setLanguage] = useState<Language>("ru");

  // Don't render the form until we know the user is authed (avoids a flash).
  if (!ready || !isAuthenticated) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(
      {
        name,
        ...(email ? { email } : {}),
        ...(birthday ? { birthday } : {}),
        language,
      },
      {
        // Profile now complete; the tour is the next gate (postAuthRoute would send
        // a fresh login here, but we route forward directly after this success).
        onSuccess: () => router.replace("/onboarding"),
      },
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

      <div className="relative z-10 w-full max-w-[420px] animate-[jqIn_.4s_ease]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-brand-gradient font-display text-3xl font-extrabold text-brand-fg shadow-glow">
            J
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink sm:text-[27px]">
            {t("profile.complete.title")}
          </h1>
          <p className="mt-1.5 text-sm text-subtle">{t("profile.complete.subtitle")}</p>
        </div>

        <div className="mt-6 rounded-[22px] border border-line bg-card/80 p-5 shadow-card backdrop-blur-sm sm:p-6">
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <Input
              label={t("profile.complete.name")}
              type="text"
              autoComplete="name"
              placeholder={t("profile.complete.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label={t("profile.complete.emailOptional")}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label={t("profile.complete.birthdayOptional")}
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink">{t("profile.complete.language")}</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-ink focus:border-brand focus:outline-none"
              >
                {LANGS.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            {updateProfile.isError && (
              <p className="text-sm text-danger">{errMessage(updateProfile.error)}</p>
            )}
            <Button type="submit" disabled={updateProfile.isPending || !name.trim()}>
              {updateProfile.isPending ? t("common.loading") : t("profile.complete.submit")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

NOTE: `me` is wired for the auth gate / future prefill but the form starts blank (new phone users have no data). If `tsc` flags `me` as unused, prefix with `void me;` with a comment, or remove the `useMe` line and its import. Verify against the actual lint/tsc result.

- [ ] **Step 3: Typecheck the web app**

```bash
cd frontend && pnpm --filter web typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/packages/i18n/src/locales.ts frontend/apps/web/app/signup/complete/page.tsx
git commit -m "feat: add phone-signup profile completion page"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full backend accounts suite**

```bash
cd backend && source ../.venv/bin/activate && python -m pytest apps/accounts/ -v 2>&1 | tail -30
```

Expected: all PASS.

- [ ] **Step 2: Frontend typecheck + the helper unit test**

```bash
cd frontend && pnpm --filter @jaqyn/api typecheck && pnpm --filter web typecheck && pnpm --filter web vitest run app/_lib/postAuthRoute.test.ts
```

Expected: no type errors; postAuthRoute tests PASS.

- [ ] **Step 3: Manual E2E — password reset (Mailpit)**

Start backend + frontend dev servers. Create/seed a user with email + password. On `/login` Email & password tab, click "Forgot password?" → enter the email → check `http://localhost:8025` (Mailpit) for the reset code → enter code + new password → confirm you land logged-in on `/`. Confirm the new password works on a fresh login and the old one fails.

- [ ] **Step 4: Manual E2E — phone profile completion**

Sign up via phone with a brand-new number → confirm redirect to `/signup/complete` (not straight to `/onboarding`) → submit with a name → confirm you proceed to `/onboarding` → finish the tour → reach the app. Log out and back in with the same number → confirm you go straight to the app (gate stays satisfied). Verify an email signup still skips the completion form (goes phone-free straight to onboarding).
