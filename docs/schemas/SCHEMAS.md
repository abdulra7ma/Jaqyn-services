---
title: Data Schemas
service: shared
type: reference
status: active
last_reviewed: 2026-06-30
---

# Data Schemas

Summary of the backend data model. **Canonical source:**
[`backend/docs/data-model.md`](../../backend/docs/data-model.md), generated from
each app's `models.py`. This page must not contradict it.

Conventions: UUID primary keys everywhere (`core/fields.py`). `TimeStampedModel`
adds `created_at` (auto-add) + `updated_at` (auto-now); `UUIDModel` adds only the
UUID PK. `USE_TZ=True` — all datetimes UTC. Money/exact quantities use `Decimal`.
Choice values are the exact strings stored.

## Models by app

- **accounts** — `User` (phone-or-email login, role
  customer/business_owner/staff/admin), `CustomerProfile`.
- **businesses** — `Business` (status / onboarding_status / verification_status /
  visibility_status), `BusinessType`, `BusinessNote`, `CatalogItem`,
  `BusinessImage` (gallery, max 8), `StaffInvite`, `BusinessOwnerInvite`.
- **campaigns** — `Campaign` (individual/group/social), `CampaignRule`,
  `CampaignReward`, `CampaignParticipant`, `CampaignAction`,
  `CampaignRewardVoucher`, `Group`, `GroupMember`.
- **loyalty** — `LoyaltyProgram` (points/stamp/visit), `LoyaltyMembership`,
  `LoyaltyTransaction` (earn/redeem/adjust/reverse), `LoyaltyVoucher`.
- **notifications** — `NotificationPreference`, `NotificationLog`.
- **qr** — `QRCodeToken` (9 token types), `ApprovalCode`, `ScanLog`.
- **reporting** — `AdminAuditLog`.
- **staff** — `StaffMember` (cashier/manager, optional linked User, `pin_hash`).
- **system** — `SystemConfiguration` (singleton: `max_active_groups_per_user`,
  `trial_period_days`).

For every field, relation, `on_delete`, and choice enum, see
[`backend/docs/data-model.md`](../../backend/docs/data-model.md).
