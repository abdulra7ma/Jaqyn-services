# B10 — Notifications & Operational Jobs (Phase 6)

Phase: 6 · Scope: later · Depends on: B01, B04, B07

## Goal
Celery-based notifications + scheduled jobs.

## Tasks (Celery)
- `send_otp(phone, code)` — SMS provider (pluggable; dev logs).
- `send_group_full_notification(group_id)`
- `send_visit_reminder(group_id)` — before visit_time.
- `send_reward_unlocked(customer_id, reward_id)`
- `send_business_weekly_report(business_id)`
- Beat: `rotate_approval_codes` (daily) · `expire_old_groups` · `expire_rewards`.

## Channels (TBD §13)
MVP: SMS OTP. Optional Telegram/WhatsApp, email for owners. Abstract behind a
`Notifier` interface so providers swap without touching callers.

## Events
Customer: OTP, group created, friend joined, group full, visit reminder, reward
unlocked, group expired. Business: new group, reached size, scheduled soon,
completed, weekly report.

## Endpoints
- Customer/business notification preferences (CRUD on profile/settings).
- Admin: notification logs.

## Acceptance (TBD Phase 6)
OTP sent + rate-limited · group reminder fires before visit · members notified on
full · business notified on scheduled group · weekly report generates.

## Definition of Done
Tasks idempotent + retry on failure · failures logged (Sentry) · provider abstracted ·
tests with eager Celery.

## Checkpoint update
B10 = DONE, note SMS provider + beat schedule.
