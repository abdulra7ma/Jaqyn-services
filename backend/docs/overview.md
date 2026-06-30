---
title: Backend Overview
service: backend
type: overview
status: active
last_reviewed: 2026-06-30---

# Backend Overview

## Stack

- Django 5 + Django REST Framework (`backend/config/settings/base.py`)
- Auth: SimpleJWT — 30 min access / 14 day refresh, blacklist after rotation
  (`SIMPLE_JWT`, `base.py`)
- Celery + Redis (broker/result/cache all Redis; `base.py`, `config/celery.py`)
- Postgres in containers; SQLite fallback when `DB_ENGINE != postgres`
  (`base.py` DB block, line ~192)
- Django admin themed with `django-unfold` (`INSTALLED_APPS`, `base.py`)
- Media via local FS or Cloudflare R2 (S3 API) when `USE_S3=true` (`base.py`)

## Apps (`backend/apps/`)

| App | Responsibility (derived from code) |
|---|---|
| `accounts` | Users + customer profiles; phone-OTP, email-OTP, password login, password reset, profile/avatar. `models.py` (`User`, `CustomerProfile`), `views.py`, `services.py` |
| `businesses` | Business records, onboarding wizard, catalog/gallery, owner+staff invites, public discovery, admin approval/verification, trials, demo seeding. `models.py`, `views.py`, `onboarding_views.py`, `admin_views.py`, `services.py` |
| `campaigns` | Loyalty/marketing campaigns (individual / group / social), rules, rewards, participants, actions, reward vouchers, group sessions; unified staff scanner. `models.py`, `views/`, `services/` |
| `loyalty` | Standing loyalty programs (points / stamp / visit), memberships, transactions, vouchers; owner setup, customer join/redeem, staff award. `models.py`, `views.py`, `services/` |
| `notifications` | Per-user channel/event preferences + send-attempt log. `models.py` (`NotificationPreference`, `NotificationLog`), `services.py`, `tasks.py` |
| `qr` | QR token mint/resolve (multiple token types), rotating business approval codes, scan logging. `models.py` (`QRCodeToken`, `ApprovalCode`, `ScanLog`), `services.py` |
| `reporting` | Admin metrics/audit, business reports + customer list, admin moderation actions, admin dashboard/analytics views. `models.py` (`AdminAuditLog`), `views.py`, `services.py`, `analytics.py`, `dashboard.py` |
| `staff` | Staff members per business (cashier/manager), owner "Manage Staff" surface, staff scan/activity views. `models.py` (`StaffMember`), `views.py`, `management_views.py`, `services.py` |
| `system` | Singleton `SystemConfiguration` (admin-tunable group/trial limits). `models.py` only — no domain service or API. |

All models inherit UUID primary keys (`core/fields.py`).
