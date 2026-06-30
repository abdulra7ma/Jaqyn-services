---
title: qr app
service: backend
type: reference
status: active
last_reviewed: 2026-06-30---

# qr

QR token minting/resolution, rotating business approval codes, and scan logging.

**Models** (`models.py`): `QRCodeToken` (9 token types incl. merchant_collect,
customer_profile, campaign, campaign_reward, loyalty_reward, group_*),
`ApprovalCode` (time-windowed numeric code), `ScanLog` (success/failed/blocked
audit). See `data-model.md`.

**Key services** (`services.py`): `create_token`, `resolve_qr_token`,
`get_or_create_customer_profile_token`, `get_or_create_merchant_collect_token`,
`generate_approval_code` / `current_approval_code` / `code_window` /
`rotate_codes_for_all_businesses`, `validate_approval_code`, `disable_qr_token`,
`link_staff_user`, `staff_token`.

**Tasks** (`tasks.py`): `rotate_approval_codes` (daily on beat).

**Endpoints:** `/api/qr/<token>/` (public resolve — encodes a `FRONTEND_URL`
target so a phone camera opens the web app), `/api/merchant/<business>/
validate-code/`, `/api/customer/qr/` (personal QR), plus business QR + approval
code regeneration mounted under `/api/business/`. See `api.md`.

**Responsibilities:** issuing and resolving every QR token type, rotating daily
approval codes, validating approval codes with a failed-attempt limit, and
logging scans for fraud/audit.
