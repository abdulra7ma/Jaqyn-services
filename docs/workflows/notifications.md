---
title: Notifications Reference
service: cross-cutting
type: reference
status: active
last_reviewed: 2026-06-30
---

# Notifications (cross-cutting reference)

Not a user-initiated end-to-end flow — notifications are **side effects** triggered
by other workflows (a visit recorded, a reward unlocked, a group filled, a weekly
roll-up). There's no FE→BE→FE request/response to trace, so this is a reference of
triggers, channels, and the one customer-facing preference surface.

## Components

- **Service:** `notifications/services.py` `Notifier` — wraps email / SMS / push.
- **Models:** `NotificationPreference` (per-user opt-in flags),
  `NotificationLog` (delivery audit).
- **Preference endpoint:** `GET /api/notifications/preferences/`
  (`notifications/urls.py:6`). 🟠 No Next caller found — preferences are not yet
  surfaced in the customer UI (candidate: add to `/profile`).
- **Admin:** `GET /api/admin/notification-logs/` (`notifications/admin_urls`).

## Triggers (Celery tasks)

| Task | Fired from | Channel intent |
|---|---|---|
| `notifications.send_group_full_notification` | group reaches capacity ([campaign-group-session](campaign-group-session.md)) | push/email to leader |
| `notifications.send_visit_reminder` | scheduled / inactivity | reminder |
| `notifications.send_reward_unlocked` | voucher issued ([campaign-collect-redeem](campaign-collect-redeem.md), loyalty) | reward earned |
| `notifications.send_business_weekly_report` | scheduled | merchant digest |
| `campaigns.notify_*` (6 tasks) | campaign visit/reward/expiry/ending | various |

## Rules (per `.claude/rules/backend.md`)

- All post-write side effects must go through `transaction.on_commit` — never
  `.delay()` from inside `transaction.atomic`. Verify each trigger site obeys this.
- Tasks idempotent; pass ids not instances; `max_retries`/`retry_backoff`/time limit set.
- Never log tokens or PII; `NotificationLog` stores delivery metadata, not message PII.

## Gaps

- 🟠 **No preferences UI.** `GET /api/notifications/preferences/` exists but nothing
  in the Next app reads it, so a customer can't manage opt-ins. **Fix:** add a
  notifications section to `/profile` that GETs and (needs a) PATCHes preferences —
  note there's currently **no write endpoint** for preferences; one would have to be
  added in `notifications/views.py` if editing is wanted.
- **Open question:** confirm every `notify_*` enqueue is wrapped in
  `transaction.on_commit` (audit `campaigns/services/*` and the trigger sites).
