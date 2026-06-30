---
title: notifications app
service: backend
type: reference
status: active
last_reviewed: 2026-06-30---

# notifications

Per-user notification preferences and a send-attempt log.

**Models** (`models.py`): `NotificationPreference` (O2O user; channel toggles
sms/email/telegram/whatsapp + event toggles reward/group/business-report/
campaign), `NotificationLog` (channel, event, status sent/failed/skipped,
payload, error).

**Key services** (`services.py`) + `tasks.py`: dispatch a notification for an
event, honour the recipient's preferences, and record a `NotificationLog` row
per attempt. Campaign/voucher notification tasks (e.g. expiring-soon) are defined
in `apps.campaigns.tasks` and route through this app's send path.

**Endpoints:** `/api/notifications/preferences/` (user prefs),
`/api/admin/notification-logs/` (admin log view). See `api.md`.

**Responsibilities:** own the notification preference model, gate sends by
preference, and keep an auditable log of every send/skip/failure.
