# B01 — Auth, Roles, Customer Profile

Phase: 1 · Scope: Sprint 1 · Depends on: B00

## Goal
Phone+OTP login issuing JWTs, role model, customer profile, `me`/`profile`.

## Models  (see SCHEMAS.md)
User · CustomerProfile.

## Endpoints  (see API.md → Auth)
- `POST /api/auth/request-otp/`
- `POST /api/auth/verify-otp/`
- `POST /api/auth/logout/`
- `GET  /api/auth/me/`
- `PATCH /api/auth/profile/`

## Logic
- request-otp: validate E.164 phone → generate 4–6 digit code → store in Redis
  with TTL (~5 min) keyed by phone → enqueue `send_otp` Celery task (dev: log code)
  → return `request_id`, `expires_in`. Rate-limit per phone AND per IP (Redis
  counters) → `RATE_LIMITED` (429) when exceeded.
- verify-otp: check code vs Redis. Wrong → `INVALID_OTP`. Missing/expired →
  `OTP_EXPIRED`. Max attempts then block. On success: get_or_create User by phone
  (role=customer default), set `is_phone_verified=true`, create CustomerProfile if
  new, issue access+refresh, return `user` + `is_new`. Emit `customer_signed_up` if new.
- me: return user (+ profile if customer, + business summary if owner/staff).
- profile: patch name/email/birthday/language/marketing_opt_in.
- logout: blacklist refresh.
- Roles via `User.role` + DRF permission classes (`core/permissions.py`).

## Permissions
request/verify-otp public; others authenticated. Profile edits own record only.

## Acceptance (TBD Phase 1 + §21.1)
- valid login · invalid OTP fails · expired OTP fails · resend works ·
  OTP rate limit triggers · returning user logs in (is_new=false).

## Definition of Done
Endpoints return envelope · permissions tested · OTP never returned in prod
responses · tests for happy + each failure path · admin shows users.

## Checkpoint update
B01 = DONE, note OTP provider (stub vs real) + rate-limit values.
