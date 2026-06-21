# B03 — QR Tokens, Staff, Approval Codes

Phase: 2 · Scope: Sprint 1 · Depends on: B02

## Goal
Random unguessable QR tokens, merchant collect QR + PNG, staff PIN login, daily
rotating approval codes, ScanLog plumbing.

## Models
QRCodeToken · StaffMember · ApprovalCode · ScanLog.

## Endpoints
- `GET /api/business/qr/` 🏪 → get-or-create `merchant_collect` token + PNG/url.
  Emit `merchant_qr_downloaded`.
- `GET /api/qr/{token}/` → resolve token → {type, business, active reward?}. Bad →
  `INVALID_QR_TOKEN`; expired → `QR_TOKEN_EXPIRED`; disabled → blocked. Logs scan.
- `POST /api/staff/login/` 🔓 body {business_code, pin} → verify pin_hash → staff JWT.
- `GET /api/staff/today-code/` 🧑‍💼 → current ApprovalCode.
- `POST /api/business/approval-code/regenerate/` 🏪
- `POST /api/merchant/{business_id}/validate-code/` 👤 body {code}

## Logic
- Token: `secrets.token_urlsafe(16)`+, unique, never raw IDs. Helper
  `create_token(type, **fk)`. `is_active` + optional `expires_at`.
- Approval code: per-business, short code, valid_from/valid_to (daily window).
  Celery beat `rotate_approval_codes` regenerates daily; manual regenerate too.
  validate-code checks business + active + time window → `INVALID_APPROVAL_CODE`.
  Rate-limit failed attempts per business/customer (Redis).
- Staff login: business has a shared code; staff enters business_code + PIN
  (pin_hash compare). Issue short-lived staff JWT bound to business + staff role.
- ScanLog helper `log_scan(...)` writes success/failed/blocked + reason + ip/ua.

## Acceptance (TBD §21.2 partial)
- valid/invalid/disabled/expired QR resolve correctly · staff PIN login ·
  today-code visible to staff · valid vs invalid approval code · every attempt logs.

## Definition of Done
Tokens unguessable (no DB ids) · all paths logged · rate limiting on code attempts ·
tests for token + code + staff login · admin shows QRCodeToken, ApprovalCode, ScanLog.

## Checkpoint update
B03 = DONE, note token length, code format, rotation schedule.
