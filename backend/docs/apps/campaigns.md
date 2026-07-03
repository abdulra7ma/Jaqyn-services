---
title: campaigns app
service: backend
type: reference
status: active
last_reviewed: 2026-06-30---

# campaigns

The largest domain: individual / group / social campaigns, their rules, rewards,
participation, action verification, reward vouchers, and the unified staff
scanner.

**Models** (`models.py`): `Campaign`, `CampaignRule`, `CampaignReward`,
`CampaignParticipant`, `CampaignAction`, `CampaignRewardVoucher`, `Group`,
`GroupMember`. See `data-model.md`.

**Key services** (`services/` package, split by responsibility):
- `campaign.py` — CRUD + lifecycle (publish/pause/resume/end/cancel/duplicate).
  It also owns `home_priority_ids`, which ranks joined campaigns by actions
  remaining for the customer-home carousel.
- `eligibility.py` — join/eligibility checks (active window, caps, completion limit).
- `progress.py` — record actions, advance participant progress, mint vouchers.
- `rewards.py` — voucher issue / present / redeem / cancel / item selection.
- `group.py` — group session start/invite/leave/check-in.
- `social.py` — `build_social_post` (generated caption/hashtags), social proof.
- `scanner.py` — unified staff scan dispatch (`ensure_business_active`, etc.).
- `fraud.py` — fraud sweep; `analytics.py` — campaign analytics.

**Tasks** (`tasks.py`, on beat): `expire_old_groups`,
`expire_campaign_vouchers`, `transition_campaign_lifecycle`,
`sweep_campaign_fraud`, `notify_vouchers_expiring_soon`,
`notify_campaigns_ending_soon`.

**Endpoints:** `/api/business/campaigns/`, `/api/customer/` (campaigns +
campaign-groups + campaign-vouchers + wallet), `/api/staff/campaigns/` (unified
scanner: scan / visit / redeem / confirm-group / confirm-social).
`/api/admin/campaigns/` is a wired-but-empty placeholder. See `api.md`.

**Responsibilities:** authoring and lifecycle of campaigns, customer join +
progress, staff-verified actions (scan/manual/auto-join), reward voucher
issuance and redemption, group formation and check-in, social-proof campaigns,
scheduled expiry/lifecycle/fraud/notification jobs.
