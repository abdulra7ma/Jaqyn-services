# Campaigns Restructure — Design Spec

**Date:** 2026-06-26
**Source:** `Campaigns Restructure - Dev Handoff` (prototype `Jaqyn.dc.html`)
**Status:** Approved design — ready for implementation planning

## 1. Summary

Groups stop being a separate feature. Every offer a business runs becomes a
**Campaign** of one type: **Individual**, **Group**, or **Social**. A
customer-created group is a participation object living *inside* a Group
campaign. The three legacy concepts — loyalty reward programs, group
offers/deals, and campaigns — collapse into a single `Campaign` table with a
`type` discriminator plus a child `Group` table keyed by `campaign_id`.

This is a **pre-launch clean cut**: no production data to preserve. The legacy
`loyalty` and `groups` Django apps are deleted entirely; schema is replaced, not
backfilled; seed/demo data is rewritten.

## 2. Decisions (locked)

| Decision | Choice |
| --- | --- |
| Backend depth | **Full collapse** into the `campaigns` app |
| Data | **Pre-launch clean cut** — no backfill, drop legacy tables |
| INDIVIDUAL mechanics | **visit-count + stamp (max-banked) + spend threshold**; drop coupon/welcome/birthday |
| SOCIAL mechanic | **Staff-verified proof** — reuse staff-scan/visit path; no Instagram API; reach = sum of self-entered follower counts |
| Legacy apps | **Delete `loyalty` and `groups` entirely** (dirs, models, migrations, URLs, INSTALLED_APPS) |
| Delivery | Spec + phased plan first; user reviews before any code |

## 3. Domain model (target schema, `apps/campaigns`)

```
Campaign
  type            INDIVIDUAL | GROUP | SOCIAL            # discriminator
  status          DRAFT | SCHEDULED | ACTIVE | PAUSED | ENDED | CANCELLED
  business (FK), created_by (FK), name, description, image
  start_at, end_at
  active_days (JSON), active_start_time, active_end_time # "time window", all types
  max_participants, max_rewards
  completion_limit_per_customer  ONCE | REPEATABLE
  auto_join_enabled, allow_multiple_campaign_counting
  instagram_handle (nullable; SOCIAL only)
  ending_warned_at (idempotency marker)

CampaignRule (1:1 Campaign)
  # INDIVIDUAL
  mechanic        VISIT | STAMP | SPEND                  # NEW sub-discriminator
  required_count           (visits / stamps)
  required_spend, min_spend (Decimal)
  max_banked               (stamp cards)
  max_count_per_day, minimum_time_between_actions
  # GROUP
  required_group_size, group_checkin_window_minutes
  # SOCIAL has no extra rule fields (completion = staff verify)

CampaignReward (1:1 Campaign)
  reward_type     FREE_ITEM | DISCOUNT | UPGRADE | CUSTOM
  reward_receiver_type  LEADER | EVERY_MEMBER | TABLE
  title, description, estimated_cost, expiry_days_after_unlock, max_redemptions

CampaignParticipant (N:1 Campaign)   # absorbs loyalty CustomerRewardProgress
  customer (FK), status JOINED|IN_PROGRESS|COMPLETED|REDEEMED
  progress_count, current_spend, completion_cycle
  joined_at, completed_at, last_progress_at
  follower_count (nullable; SOCIAL self-entered, feeds "reach")
  unique(campaign, customer)

CampaignAction (N:1 Campaign, Participant)   # audit log
  action_type     VISIT | GROUP_CHECKIN | SOCIAL_PROOF | REFERRAL
  verification_method  STAFF_SCAN | STAFF_MANUAL | AUTO_JOIN
  status COUNTED|REJECTED|FLAGGED, action_time, verified_by_staff (FK), metadata

CampaignRewardVoucher (N:1 Campaign, Reward)  # the ONE wallet/redemption object
  voucher_code (unique), status ACTIVE|REDEEMED|EXPIRED|CANCELLED
  issued_at, expires_at, redeemed_at, redeemed_by_staff (FK), qr_token (FK)
  expiry_warned_at

Group (N:1 Campaign)              # was GroupSession + GroupDeal, merged
  group_leader (FK), status FORMING|FULL|CHECKING_IN|COMPLETED|EXPIRED|CANCELLED
  required_size, invite_token (unique), expires_at, completed_at

GroupMember (N:1 Group)           # was GroupSessionMember + GroupMember
  customer (FK), status JOINED|CHECKED_IN|LEFT|NO_SHOW
  joined_at, checked_in_at
  unique(group, customer)
```

**Collapse mapping**

| Legacy | Target |
| --- | --- |
| `loyalty.RewardProgram` (STAMP/VISIT/SPEND) | `Campaign(type=INDIVIDUAL)` + `CampaignRule(mechanic=…)` |
| `loyalty.CustomerRewardProgress` | `CampaignParticipant` |
| `loyalty.RewardRedemption` / `RewardTransaction` | `CampaignRewardVoucher` / `CampaignAction` |
| `groups.GroupOffer` + `campaigns.GroupSession` | `Campaign(type=GROUP)` |
| `groups.GroupDeal` + `campaigns.GroupSessionMember` | `Group` / `GroupMember` |
| `campaigns.campaign_type` VISIT / TIME_WINDOW | `INDIVIDUAL` (+ active-hours config); GROUP stays GROUP |
| loyalty COUPON / WELCOME / BIRTHDAY | **dropped** |

The "Groups" detail tab is simply `Group WHERE campaign_id = ?`.

## 4. Service layer

One service package `apps/campaigns/services/` (already exists, ~9 files). Changes:

- `campaign.py` — type-aware CRUD, publish gate, state machine for all three types.
- `progress.py` — branch by `CampaignRule.mechanic` for INDIVIDUAL (visit / stamp+max_banked / spend); GROUP via group check-in; SOCIAL via staff proof.
- `group.py` — operate on `Group`/`GroupMember` (absorbs `groups.services`).
- `rewards.py` — single voucher minting + redemption eligibility (absorbs loyalty `RedemptionService`).
- `scanner.py` — unified dispatch gains `SOCIAL_PROOF` confirm path.
- `analytics.py` — per-type stat triplets (Individual: Enrolled/Redeemed/Close-to-reward · Group: Groups created/Customers joined/Redeemed · Social: Joined/Redeemed/Reach).
- Delete `loyalty/services.py` and `groups/services.py`.

Services raise domain exceptions (existing `ServiceError` hierarchy); no error sentinels. All side effects via `transaction.on_commit`; read-modify-write on progress/vouchers under `select_for_update`.

## 5. API surface (keep current versioning)

**Business**
- `GET/POST /business/campaigns/` — list supports `?type=` (individual|group|social) and `?status=` (active|draft|completed); paginated with hard max page size.
- `GET /business/campaigns/{id}/` — detail; tab payloads: overview, participants, groups (GROUP only), reward-usage, analytics, settings.
- Keep publish/pause/resume/end/cancel/duplicate/analytics/image/social-post.
- **Remove** `/business/loyalty/*`, `/business/group-offers/*`, `/business/group-deals/*`.

**Customer**
- `GET /customer/campaigns/feed/` → `{ followed: [...in-progress], discover: [...] }` with `discover` filterable (all|group|neighborhood|ended).
- Keep `GET /customer/campaigns/{id}/`, join, group start/detail/invite/check-in, voucher present.
- Wallet unifies on `/customer/campaign-wallet/`.
- **Remove** `/wallet/*`, `/customer/rewards/*`.

**Staff**
- Keep unified `/staff/campaigns/scan/`, `/visit/`, `/confirm-group/`.
- **Add** `/staff/campaigns/confirm-social/` (verify SOCIAL proof → mint voucher).

drf-spectacular schema regenerated; CI stale-schema gate must pass.

## 6. Frontend

**Business (`apps/web/app/business`, `OwnerShell`)**
- Sidebar "Grow" group = **Campaigns only**. Remove "Loyalty program" and "Group Deals".
- Delete/redirect `/business/rewards*` and `/business/offers*` → `/business/campaigns`.
- List: Type filter row + Status filter row; cards = type badge + status pill + 3 type-specific stats + reward.
- Create: Step 1 type chooser → Step 2 single adaptive form (group size & window / required visits + mechanic / IG handle). Replaces the 5-step wizard.
- Detail: tabs Overview · Participants · Groups (GROUP only) · Reward Usage · Analytics · Settings.

**Customer (`apps/web/app`)**
- `/campaigns`: one feed — "From places you go" swipe row (in-progress, from feed.followed) + "Discover more" chips (All/Group/Neighborhood/Ended) over merged card list (feed.discover). Cards route into existing detail/group screens.
- Group flow screens kept intact and verified: offer detail, create (pick time), your group (forming), invite (WA/TG/IG), full state, check-in, reward (QR), plus edge screens join-via-link and window-expired.
- `BottomNav`: `Home · Rewards · [Scan] · Campaigns · Profile`. Remove Groups tab; scan FAB → raised center button; add Nearby shortcut to Home header; repoint old group entry points → `/campaigns`.

**API client (`packages/api`)**
- Collapse `business/offers` + `business/rewards` + `group-offers` hooks/keys into the campaigns query-key factory.
- Add `useCampaignFeed`, social confirm, unified wallet hooks.
- All external payloads parsed (zod) at the boundary.

## 7. Clean-cut migration

- Replace `apps/campaigns/migrations` with a fresh initial migration for the new schema (squash acceptable pre-launch).
- Delete `apps/loyalty` and `apps/groups` (code + migrations); remove from `INSTALLED_APPS` and root URL conf; drop their tables.
- Rewrite `seed()` / demo fixtures: emit one Active **Social**, one Draft **Group**, one Completed **Individual** campaign per demo business (drives the Status filter).
- No data backfill; no dual-read compatibility window.

## 8. Testing

**Backend**
- Service tests per type/mechanic: progress → complete → voucher (visit, stamp+max_banked, spend, group check-in, social proof).
- Unified scanner dispatch incl. SOCIAL_PROOF.
- `django_assert_num_queries` on list + feed + wallet endpoints (N+1 gate).
- Every changed view: auth + permission + happy path.

**Frontend**
- RTL: list Type/Status filters, create adaptive form per type, customer feed sections + chips (MSW at the network boundary).
- Keep/extend Playwright for the full group flow (create → invite → check-in → reward) and the new bottom-nav scan.

## 9. Delivery — phased PRs

1. **Backend schema + services + migrations** (collapse, delete legacy apps) + tests.
2. **Backend API** (unified list/feed/wallet/social-confirm) + schema regen + tests.
3. **Frontend API client** refactor (query keys, hooks, types).
4. **Frontend business** (nav, list, create flow, detail tabs).
5. **Frontend customer** (feed, bottom nav, group-entry repoint).
6. **Seed/demo + cleanup + e2e** verification.

## 10. Risks / notes

- Largest blast radius is the unified scanner and the single voucher/wallet path — both already exist in `campaigns`, which lowers risk.
- SOCIAL "reach" is self-reported and abusable by design (accepted; no IG API).
- Dropping COUPON/WELCOME/BIRTHDAY is a deliberate feature cut (pre-launch).
- Schema regen + drf-spectacular regen must land together to keep CI green.
