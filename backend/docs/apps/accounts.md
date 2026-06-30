---
title: accounts app
service: backend
type: reference
status: active
last_reviewed: 2026-06-30---

# accounts

Authentication and customer identity.

**Models** (`models.py`): `User` (custom, phone or email, `role` =
customer/business_owner/staff/admin), `CustomerProfile` (language, birthday,
opt-in, onboarding/profile completion flags).

**Key services** (`services.py`): `issue_otp` / `verify_otp` (phone),
`issue_email_otp` / `verify_email_otp` (email signup), `authenticate_password`,
`issue_password_reset_otp` / `reset_password`, plus Redis key helpers
(`otp_key`, `*_attempt_key`) and rate-limiting. `DEV_LOGIN_OTP` bypasses real OTP
in dev only.

**Endpoints** (`/api/auth/`): request/verify phone OTP, request/verify email OTP,
password login, password-reset request/confirm, logout (refresh blacklist), me,
profile, avatar upload. See `api.md`.

**Responsibilities:** all login/signup flows, OTP issuance + verification with
rate limits, JWT issuance, password reset without account enumeration, and the
customer profile (incl. the `profile_completed` gate for phone signups).
