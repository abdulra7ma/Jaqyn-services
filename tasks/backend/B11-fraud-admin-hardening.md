# B11 — Fraud Controls, Admin Tools, Production Hardening (Phase 7)

Phase: 7 · Scope: later · Depends on: all prior

## Goal
Rate limits, abuse rules, admin remediation tools, backups, monitoring.

## Backend
- Rate limiting: OTP, approval-code attempts, group joins/day, collection/day
  (Redis counters). Return `RATE_LIMITED` / `SCAN_LIMIT_REACHED`.
- Suspicious-activity flags (rapid repeats, many failures) surfaced to admin.
- Admin remediation REST + Admin actions:
  `POST /api/admin/manual-adjustment/` (RewardTransaction action=`adjusted`),
  `POST /api/admin/users/{id}/block/` (is_active=false),
  `POST /api/admin/businesses/{id}/disable/` (status=disabled, kill QR),
  disable QR token, mark group failed/completed.
- Audit logging for admin actions (who/what/when). Emit admin analytics events.
- Backups: daily Postgres dump + media backup; documented restore.
- Monitoring: Sentry, server/API/Celery failure logs, high-error-rate alert.

## Fraud rules checklist (TBD §12)
- [ ] phone verification required to earn
- [ ] collection limit per business/customer/day
- [ ] min interval between repeat scans
- [ ] approval code rotation + window + failed-attempt rate limit
- [ ] group check-in window enforced
- [ ] group reward once; unique phone-verified members
- [ ] QR tokens random/expirable/disablable
- [ ] all scans + failures logged

## Acceptance (TBD Phase 7, §21.5)
App survives common mistakes · admin fixes wrong progress · admin disables abusive
user/business/QR · backups + monitoring in prod · manual fallback works.

## Definition of Done
All fraud checkboxes ticked · admin actions audited · backups verified by a test
restore · Sentry receiving events.

## Checkpoint update
B11 = DONE, note backup cron + restore test result.
