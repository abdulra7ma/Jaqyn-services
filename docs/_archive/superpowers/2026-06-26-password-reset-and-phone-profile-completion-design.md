---
title: Password Reset + Phone Profile Completion — Design
service: shared
type: spec
status: deprecated
last_reviewed: 2026-06-30
---
# Password Reset + Phone Profile Completion — Design

**Status:** Approved (brainstorm 2026-06-26)
**Branch:** `feat/email-signup-otp` (extends the just-shipped email-signup-OTP work)

## Goal

Two additions to the auth system:

1. **Password reset via email code** — anyone with an email + usable password can reset it through an emailed 6-digit code, then is auto-logged-in.
2. **Phone-signup profile completion gate** — a new phone-signup customer must complete required profile info (Name) before entering the app.

## Background / Current State

- Auth endpoints live in `backend/apps/accounts/` (`services.py`, `views.py`, `serializers.py`, `urls.py`, `tasks.py`).
- Email OTP signup already exists and establishes the reusable pattern: OTP code + payload stored in Redis (`cache`) keyed by email with `OTP_TTL_SECONDS` TTL; rate limited via `core.ratelimit.hit_limit`; emailed via a Celery task using Django's `send_mail`; domain errors raised as `JaqynAPIException`.
- `authenticate_password(email, password)` already does email+password login.
- `_auth_payload(user, access, refresh, **extra)` in `views.py` shapes the login response; it currently includes `area` and `onboarding_completed`.
- `CustomerProfile` has `onboarding_completed` (gates the product tour). No `profile_completed` field yet.
- Frontend: `/login`, `/signup`, `/signup/email`. Two `go()` routers (in `login/page.tsx` and `signup/email/page.tsx`) currently route new customers to `/onboarding`.
- No password-reset code exists anywhere.
- Latest accounts migration: `0004_user_email_otp.py`.

## Part A — Password Reset (email code)

### Flow
1. User taps **"Forgot password?"** on the login page (Email & password tab).
2. `/forgot-password` step 1: enter email → `POST /api/auth/request-password-reset/`.
3. Backend generates a 6-digit code, stores it in Redis (`pwreset_otp:{email}`), emails it. **Always returns success** regardless of whether the account exists (no account enumeration). Rate-limited per email + per IP.
4. `/forgot-password` step 2: enter code + new password → `POST /api/auth/reset-password/`.
5. Backend verifies code (≤5 attempts), sets the new password, clears the code, returns the standard auth payload → user is **auto-logged-in**.

### Backend
- **Service** `issue_password_reset_otp(email, ip_address) -> None`
  - Lowercases email. Rate-limit keys `pwreset-email:{email}` and `pwreset-ip:{ip}` (limits: `OTP_RATE_LIMIT_PER_PHONE` / `OTP_RATE_LIMIT_PER_IP`, 3600s).
  - Only issues a code if a user with a usable password exists for that email — but **returns normally either way** so the response can't reveal account existence. (Rate-limit check still runs first.)
  - Stores `{"code", "request_id"}` at `pwreset_otp:{email}`; resets the attempt counter; enqueues `send_password_reset_otp_task`.
- **Service** `reset_password(email, code, new_password) -> tuple[User, str, str]`
  - Lowercases email. Reads `pwreset_otp:{email}`; missing → `OTP_EXPIRED`. Increments `pwreset_otp_attempts:{email}`; >5 → `RATE_LIMITED`. Wrong code → `INVALID_OTP`.
  - On success: load user (`email__iexact`, `is_active=True`); if absent → `INVALID_OTP` (defensive — a code only exists for real accounts). `user.set_password(new_password); user.save()`. Clear both cache keys. Return `(user, access, refresh)`.
- **Celery task** `send_password_reset_otp_task(email, code)` — same shape/retry config as `send_email_otp_task` (`max_retries=3`, `default_retry_delay=5`, `time_limit=30`), subject "Your Jaqyn password reset code".
- **Serializers** `RequestPasswordResetSerializer {email}`, `ResetPasswordSerializer {email, code(6), new_password(min 8, max 128)}`.
- **Views** `RequestPasswordResetView` (returns `{message}` only, no data leak), `ResetPasswordView` (returns `_auth_payload`). Both `AllowAny`.
- **URLs** `request-password-reset/`, `reset-password/`.

### Frontend
- API: `requestPasswordReset(email)`, `resetPassword(email, code, newPassword)` on `CustomerApi` + live impl (auth:false; `resetPassword` stores tokens like `verifyEmailOtp`). Hooks `useRequestPasswordReset`, `useResetPassword`.
- Type `ResetPasswordResult = AuthResult`.
- New page `/forgot-password` (2-step form + resend timer, same pattern as `/signup/email`).
- Login page: add **"Forgot password?"** link inside the Email & password tab → `/forgot-password`.
- i18n keys under `auth.forgot.*` (ru + en).

### Error handling
- Reuses existing `JaqynAPIException` codes (`OTP_EXPIRED`, `INVALID_OTP`, `RATE_LIMITED`) → existing DRF exception handler maps them. Frontend renders via existing `useErrMessage`.

## Part B — Phone Signup Profile Completion

### The gate
Add `CustomerProfile.profile_completed` (Boolean, default `False`), parallel to `onboarding_completed`. The flag is the persisted signal that required info is filled, so it survives relogin/reinstall.

- **Email signups**: set `profile_completed=True` at user creation in `verify_email_otp` (they already supplied name + email).
- **Phone signups**: `verify_otp` leaves it `False` for genuinely new users (existing users keep their value).

### Backend
- **Migration** `0005_customerprofile_profile_completed.py` — adds the field (schema only).
- `verify_email_otp`: when creating the profile for a new user, set `profile_completed=True`.
- `_auth_payload` + `/me`: expose `profile_completed` (computed like `_onboarding_done`: `bool(profile and profile.profile_completed)`).
- Profile PATCH (`ProfileView`): when the patch sets a non-empty `name`, also set `profile_completed=True`. (The completion form submits name → marks the gate done.)
- `ProfileUpdateSerializer`: unchanged (already accepts `name`, `email`, `birthday`, `language`). Business-rule "name required to complete" is enforced where the gate is set, plus client-side; the PATCH itself stays partial.

### Frontend
- `Me` type + `AuthResult` type: add `profile_completed?: boolean`.
- **Shared routing helper** `nextAuthPath(r, returnTo)` (new, in `app/_lib/auth.ts`) replacing the duplicated `go()` logic, priority:
  1. `area === "customer" && profile_completed === false` → `/signup/complete`
  2. else `area === "customer" && (is_new || onboarding_completed === false)` → `/onboarding`
  3. else → area path (business/staff console or returnTo)
  Both `login/page.tsx` and `signup/email/page.tsx` use it. (Email signup users have `profile_completed=true`, so they skip straight to onboarding — behavior unchanged.)
- **New page** `/signup/complete`: form with **Name (required)**, optional Email, Birthday, Language. Submit → `useUpdateProfile` PATCH (`{name, email?, birthday?, language?}`) → on success route onward (onboarding next). Guarded by `useRequireAuth` (must be logged in).
- i18n keys under `profile.complete.*` (ru + en).

### Error handling
- PATCH validation errors surface via existing `useErrMessage`. If the user reloads mid-flow, the persisted `profile_completed=false` re-routes them back to the form.

## Out of Scope (YAGNI)
- Password reset for phone-only users (they have no usable password; they log in via OTP).
- Changing email signup UX (already collects name+email).
- Making email/birthday/language required for phone signup (only Name is required).
- Account-enumeration-proofing beyond the password-reset endpoint.

## Testing
- **Backend** (pytest, `apps/accounts/tests/`):
  - `issue_password_reset_otp`: stores code for an existing email; returns normally (no raise) for a non-existent email; rate-limits per email.
  - `reset_password`: success path sets password + returns tokens; wrong code → `INVALID_OTP`; no code issued → `OTP_EXPIRED`; clears cache on success; new password actually authenticates.
  - Endpoints: `request-password-reset/` 200 + no-enumeration (same response for known/unknown email); `reset-password/` 200 returns JWT, wrong code 400.
  - `verify_email_otp` sets `profile_completed=True`; `verify_otp` new user has `profile_completed=False`.
  - Profile PATCH with non-empty name flips `profile_completed=True`.
  - Auth payload + `/me` include `profile_completed`.
- **Frontend**: typecheck gates. `nextAuthPath` is pure → unit-testable; add a vitest for its priority order.

## File Map

**Backend — create:**
- `backend/apps/accounts/migrations/0005_customerprofile_profile_completed.py`
- tests in `backend/apps/accounts/tests/test_password_reset_service.py`, `test_password_reset_views.py`, `test_profile_completion.py`

**Backend — modify:**
- `models.py` (profile_completed field)
- `tasks.py` (send_password_reset_otp_task)
- `services.py` (issue_password_reset_otp, reset_password, verify_email_otp tweak)
- `serializers.py` (two reset serializers)
- `views.py` (two reset views, _auth_payload + _profile_done, MeView, ProfileView gate)
- `urls.py` (two routes)

**Frontend — create:**
- `frontend/apps/web/app/forgot-password/page.tsx`
- `frontend/apps/web/app/signup/complete/page.tsx`
- `frontend/apps/web/app/_lib/auth.ts` helper `nextAuthPath` (+ co-located vitest)

**Frontend — modify:**
- `packages/api/src/customer/types.ts` (ResetPasswordResult, profile_completed on Me/AuthResult)
- `packages/api/src/customer/api.ts` (two methods)
- `packages/api/src/customer/hooks.ts` (two hooks)
- `packages/i18n/src/locales.ts` (auth.forgot.*, profile.complete.*)
- `frontend/apps/web/app/login/page.tsx` (Forgot link + nextAuthPath)
- `frontend/apps/web/app/signup/email/page.tsx` (nextAuthPath)
