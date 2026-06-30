---
title: API Contract
service: shared
type: contract
status: active
last_reviewed: 2026-06-30
---

# API Contract

Base path `/api/`. All responses use the envelope from `core/response.py`:
success `{success, data, message}`, error `{success, error:{code, message,
details?}}`. Auth is JWT (Bearer) unless marked public. **Canonical, fully
enumerated surface:** [`backend/docs/api.md`](../../backend/docs/api.md) (derived
from each app's `urls.py`). This page must not contradict it.

Roles: customer · staff · business_owner/manager · admin · public.

## Groups

- **Auth** `/api/auth/` — phone OTP (request/verify), email OTP (request/verify),
  password login, password-reset (request/confirm), logout, me, profile, avatar;
  plus `/api/auth/token/refresh/`.
- **Businesses (owner)** `/api/business/` — register, me, logo/cover, dashboard,
  QR + approval-code regenerate, onboarding + submit, catalog items, gallery,
  staff invites.
- **Businesses (public)** `/api/businesses/` — nearby, categories, register-lead
  (public), `<id>` detail. Plus `/api/business-types/`.
- **Businesses (admin)** `/api/admin/businesses…` &
  `/api/admin/business-verifications…` — approve / reject / disable / verify /
  request-changes.
- **Staff (manage, owner)** `/api/business/staff/` — team list, member detail,
  suspend, reactivate, reset-password.
- **Staff (operational)** `/api/staff/` — programs, today-code, scan,
  recent-activity. **No `login`/PIN endpoint** — that route was removed; staff
  scanning is the unified scanner below.
- **QR** `/api/qr/<token>/` (public resolve), `/api/merchant/<id>/validate-code/`,
  `/api/customer/qr/`.
- **Campaigns (owner)** `/api/business/campaigns/` — list/create, detail,
  publish/pause/resume/end/cancel/duplicate, participants, image, social-post,
  vouchers (+ voucher cancel), analytics.
- **Campaigns (customer)** `/api/customer/` — campaigns + feed + detail + join +
  catalog, campaign-groups (start/list/detail/invite/leave/demo-fill),
  campaign-wallet, campaign-vouchers (detail/present/select-item).
- **Campaigns (staff)** `/api/staff/campaigns/` — scan, scan-customer, visit,
  scan-voucher, redeem-voucher, confirm-group, confirm-social.
- **Loyalty (owner)** `/api/business/loyalty/programs/…` — CRUD +
  pause/activate/archive.
- **Loyalty (customer)** `/api/customer/loyalty/` — cards, program, join,
  redeem-points, catalog, vouchers, select-item, per-business loyalty.
- **Loyalty (staff)** `/api/staff/loyalty/` — award, redeem-voucher. Unified till
  scanner: `POST /api/staff/scan/`.
- **Notifications** `/api/notifications/preferences/`,
  `/api/admin/notification-logs/`.
- **Reporting** `/api/business/reports/`, `/api/business/customers/`;
  `/api/admin/` metrics, manual-adjustment, user block, qr-token disable,
  group fail/complete, scan-logs.

Per-route methods, view classes, and purposes: see
[`backend/docs/api.md`](../../backend/docs/api.md).
