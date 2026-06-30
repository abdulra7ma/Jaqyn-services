---
title: reporting app
service: backend
type: reference
status: active
last_reviewed: 2026-06-30---

# reporting

Admin metrics + audit, business reports, and admin moderation actions. Also
hosts the django-unfold admin dashboard and analytics page.

**Models** (`models.py`): `AdminAuditLog` (admin action audit trail).

**Key services** (`services.py`): `admin_metrics`, `business_metrics`,
`business_customers`, `manual_adjustment` (loyalty), `block_user`,
`disable_qr_token`, `mark_group_completed` / `mark_group_failed`,
`suspicious_scan_rows`, `audit` (writes `AdminAuditLog`).

**Other modules:** `analytics.py` (`analytics_view`, the admin analytics page
mounted at `/admin/analytics/`), `dashboard.py` (`dashboard_callback`,
`pending_businesses_badge` for the unfold dashboard), `business_reports.py`.

**Endpoints:**
- `/api/business/reports/`, `/api/business/customers/` — owner reporting.
- `/api/admin/` — metrics, manual-adjustment, block user, disable QR token,
  group fail/complete, scan-logs. See `api.md`.

**Responsibilities:** platform + per-business reporting, admin moderation
actions, and the audit log behind those actions. `reporting/urls.py` is empty
(`urlpatterns = []`); routes live in `business_urls.py` / `admin_urls.py`.
