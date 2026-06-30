---
title: Loyalty / Campaigns Split — Spec & Plan
service: backend
type: spec
status: deprecated
last_reviewed: 2026-06-30
---
# Loyalty / Campaigns Split — Spec & Plan

**Date:** 2026-06-28
**Supersedes the unification of:** `2026-06-26-campaigns-restructure-design.md`,
`2026-06-28-multi-form-loyalty-design.md` (loyalty was folded into campaigns; this
splits it back out into its own app).
**Status:** Spec for review — not yet implemented. A few open sub-decisions flagged in §12.

## 1. Goal

Loyalty and Campaigns are two different domains and must be separate apps, pages,
and backend logic:

- **Loyalty** = *ongoing, per-business reward programs* the customer collects
  passively ("fills as you visit"): **points→cashback**, **stamp cards**,
  **visit-based rewards**. No hard end date; repeatable.
- **Campaigns** = *time-bound challenges / promos*: **Individual** (e.g. "visit 5
  cafés before Jul 30 → prize"), **Group** (bring friends, unlock together),
  **Social** (follow/tag on Instagram). Have a run window; one-time per cycle.

## 2. Locked decisions

| # | Decision |
|---|---|
| Domain split | Loyalty app owns points/cashback + stamp + visit-based rewards (ongoing). Campaigns app owns time-bound Individual + Group + Social. |
| Social | **Stays a Campaign type** (Individual + Group + Social). |
| Staff scan | **One scan** of a customer QR shows BOTH loyalty programs to apply (choose-one) AND active campaign progress to advance. |
| Customer nav | **Separate** Loyalty, Rewards (wallet), and Campaigns surfaces (nav rework — see §5.1, open sub-decision). |
| Data | **Pre-launch clean cut** (assumed — confirm in §12): no production data to preserve; new `loyalty` app + trim `campaigns`, reseed. |
| Reuse | The loyalty UI built under multi-form-loyalty (BusinessLoyaltyCard, dots/cashback visuals, redeem card, staff choose-one chooser, numpad) is **re-pointed** to the new loyalty app, not rebuilt. |

## 3. Backend

### 3.1 New app: `apps.loyalty`

```
LoyaltyProgram (TimeStampedModel)
  business (FK), created_by (FK), name, description, image
  type: POINTS | STAMP | VISIT                      # the loyalty form
  status: ACTIVE | PAUSED | ARCHIVED
  # POINTS
  points_basis: VISIT | SPEND
  points_per_visit (int, null), points_per_som (Decimal, null)
  cashback_per_point (Decimal, null)                # som per point at redemption
  min_redeem_points (int, null)
  # STAMP / VISIT
  required_count (int, null)                        # stamps or visits to a reward
  max_banked (int, null)                            # STAMP only
  # reward (STAMP/VISIT; POINTS reward is cashback)
  reward_type: FREE_ITEM | DISCOUNT | UPGRADE | CASHBACK
  reward_title, reward_description, reward_expiry_days
  item_selection: FIXED | CUSTOMER (null)           # menu-item rewards
  catalog_item (FK businesses.CatalogItem, null)
  # active window (optional; loyalty is usually always-on)
  active_days (JSON), active_start_time, active_end_time

LoyaltyMembership (TimeStampedModel)                 # the customer's "card"
  program (FK), customer (FK)
  status: ACTIVE | INACTIVE
  stamps_count / visits_count (int, default 0)       # progress for STAMP/VISIT
  points_balance (int, default 0)                    # POINTS
  current_spend (Decimal, default 0)                 # SPEND-basis accumulation
  cycle (int, default 0)                             # repeatable completions
  joined_at, last_activity_at
  unique(program, customer)

LoyaltyTransaction (UUIDModel)                        # immutable ledger
  membership (FK), program, customer, business
  kind: EARN | REDEEM | ADJUST | REVERSE
  points_delta (int, null), stamps_delta (int, null)
  bill_amount (Decimal, null)                         # what the staff entered
  staff (FK StaffMember, null), source: STAFF_SCAN | ADMIN | SYSTEM
  metadata (JSON), created_at

LoyaltyReward / LoyaltyVoucher (UUIDModel)            # earned redeemable reward
  membership (FK), program, customer, business
  voucher_code (unique), status: ACTIVE | REDEEMED | EXPIRED | CANCELLED
  reward_type, reward_title
  cashback_amount (Decimal, null)                     # POINTS→cashback
  catalog_item (FK, null)                             # chosen/preset item
  qr_token (FK qr.QRCodeToken), issued_at, expires_at,
  redeemed_at, redeemed_by_staff (FK), expiry_warned_at
```

**Services (`apps/loyalty/services/`)**
- `program.py` — CRUD, publish/pause/archive, validation per type.
- `membership.py` — get-or-create card on first earn; progress reads.
- `earning.py` — `award(program, customer, staff, bill_amount=None)`:
  POINTS visit-basis → +points_per_visit; POINTS spend-basis → +floor(points_per_som×bill);
  STAMP/VISIT → +1, honoring max_banked; on reaching required_count → mint a
  LoyaltyVoucher (cycle++). Ledger row per earn. `select_for_update` on membership.
- `redemption.py` — `redeem_points(program, customer, points)` → cashback voucher;
  `select_voucher_item`; `redeem_voucher(code, staff)` (staff redeems at counter).
- `analytics.py` — per-program stats (members, points outstanding, redemptions).
- All side effects via `transaction.on_commit`; money as `Decimal`.

### 3.2 Changes to `apps.campaigns` (trim loyalty out)

- `Campaign.campaign_type` stays `INDIVIDUAL | GROUP | SOCIAL`. Individual is now a
  **time-bound count challenge** (reach `required_count` actions before `end_at`).
- **Remove** from `CampaignRule`: `mechanic` values `stamp`/`points` (+ `points_basis`,
  `points_per_visit`, `points_per_som`, `cashback_per_point`, `max_banked`).
  Keep visit-count (and optionally spend-threshold as a challenge variant — §12).
- **Remove** from `CampaignReward`: `CASHBACK` type (loyalty-only). Keep
  FREE_ITEM/DISCOUNT/UPGRADE/CUSTOM + `item_selection`/`catalog_item` (a challenge can
  still grant a menu item).
- **Remove** from `CampaignParticipant`: `points_balance` (+ spend accrual if spend
  challenges dropped).
- **Remove** endpoints/serializers: `redeem-points`, points fields on scan rows,
  cashback voucher fields.
- Keep: Group/GroupMember + full group flow, Social proof, CampaignRewardVoucher,
  CampaignAction, the feed, business list/detail.

### 3.3 QR / wallet shared concerns

- Both apps mint vouchers backed by `qr.QRCodeToken` (new token type
  `LOYALTY_REWARD` alongside `CAMPAIGN_REWARD`).
- Customer **Rewards wallet** aggregates earned vouchers from BOTH apps. Two options
  (§12): (a) Rewards page calls `/customer/loyalty/vouchers/` + `/customer/campaign-wallet/`
  and merges client-side (keeps apps independent — **recommended**); (b) a thin
  `/customer/wallet/` aggregator view.

## 4. API endpoints

### 4.1 Loyalty — business (`/api/business/loyalty/`)
- `GET/POST /programs/` — list / create (type + config)
- `GET/PATCH /programs/{id}/` — detail / update
- `POST /programs/{id}/pause/` · `/activate/` · `/archive/`
- `GET /programs/{id}/members/` — paginated memberships + progress
- `GET /programs/{id}/transactions/` — ledger (paginated)
- `GET /programs/{id}/analytics/` — stat triplet per type

### 4.2 Loyalty — customer (`/api/customer/loyalty/`)
- `GET /cards/` — all my loyalty cards across businesses (the **Loyalty tab**)
- `GET /programs/{id}/` — one card detail + my state + history
- `POST /programs/{id}/redeem-points/` `{points}` → cashback voucher
- `GET /programs/{id}/catalog/` — eligible CatalogItems (customer-choice rewards)
- `GET /vouchers/` — my loyalty vouchers (active/used/expired) → feeds Rewards wallet
- `POST /vouchers/{id}/select-item/` `{catalog_item_id}`
- `POST /vouchers/{id}/present/` — "show to staff" state (if used)
- Business-page section reuses `GET /api/customer/businesses/{id}/loyalty/` (moves to loyalty app).

### 4.3 Loyalty — staff (`/api/staff/loyalty/`)
- `POST /award/` `{token, program_id, amount?}` — the choose-one award (points need
  `amount` for spend-basis; stamp/visit ignore it). Returns updated membership state.
- `POST /redeem-voucher/` `{code}` — redeem a loyalty voucher at the counter.

### 4.4 Unified staff scan (`/api/staff/scan/`)
- `POST /scan/` → dispatch a scanned token:
  - **customer** → `{ kind:"customer", customer, loyalty:[program+state…], campaigns:[eligible…] }`
    (aggregates loyalty programs to apply + active Individual/Group campaign progress)
  - **voucher** → `{ kind:"voucher", domain:"loyalty"|"campaign", voucher }`
  - **group invite** → group check-in candidate
  - **invalid** → reason
- Confirm actions stay domain-specific: loyalty → `/staff/loyalty/award/`;
  campaign visit → `/staff/campaigns/visit/`; group → `/staff/campaigns/confirm-group/`;
  social → `/staff/campaigns/confirm-social/`; redeem → loyalty or campaign redeem.

### 4.5 Campaigns — unchanged surface (loyalty bits removed)
Keep business list/detail/create (Individual/Group/Social), customer feed/detail/join,
group flow, social confirm, `campaign-wallet`. Remove redeem-points + points fields.

## 5. Customer side

### 5.1 Navigation (open sub-decision — §12)
Six surfaces now exist: Home, Loyalty, Rewards, Campaigns, Profile, + center Scan.
Bottom nav holds 5. Two proposals:
- **A (recommended):** `Home · Loyalty · [Scan] · Campaigns · Profile`; **Rewards
  (wallet)** = a persistent wallet icon in the Home/Loyalty header (a distinct screen,
  just not a bottom tab).
- **B:** `Loyalty · Rewards · [Scan] · Campaigns · Profile` (drop the Home tab; its
  content folds into Loyalty/landing).

### 5.2 Pages
- **Loyalty tab** (`/loyalty`): "Your loyalty cards" — one `BusinessLoyaltyCard` per
  business (the consolidated card + segmented switcher + stamp/visit dots + cashback
  "Use" already built), grouped, with progress/redeem. Card detail = `/loyalty/[programId]`
  (PointsRedeemCard, history). *Reuses existing components, re-pointed to loyalty API.*
- **Rewards tab/wallet** (`/rewards`): earned vouchers (loyalty + campaign) grouped
  Active/Used/Expired; present-to-staff + item selection. (Drop the in-progress loyalty
  cards from here — those live on the Loyalty tab now.)
- **Campaigns tab** (`/campaigns`): challenges feed (Individual + Group + Social),
  discover chips, group flow + "active group" banner. *Loyalty rows removed from the feed.*
- **Business page** (`/nearby/[id]`): the loyalty section (BusinessLoyaltyCard) now
  sourced from the loyalty API; campaigns shown separately.

## 6. Business side

- **Sidebar nav**: Dashboard · **Campaigns** · **Loyalty** · Rewards/Redemptions ·
  Customers · Analytics · QR Code · Staff · Settings. (Campaigns and Loyalty are two
  separate sections.)
- **Loyalty section** (new): list of programs (type badge + stats), create flow
  (choose type Points/Stamp/Visit → adaptive form: points basis+rates+cashback /
  stamp count+max-banked / visit count, reward incl. menu-item picker), program detail
  tabs (Overview · Members · Transactions · Reward Usage · Analytics · Settings).
- **Campaigns section**: existing Individual/Group/Social create + list + detail tabs,
  with loyalty options removed from the create form.

## 7. Staff side (unified scan)
- One scan screen: scan customer QR → shows **Loyalty** (choose-one chooser w/ per-row
  actions + bill numpad for points — already built) and **Campaigns** (eligible
  Individual/Group progress to advance / group check-in). Scanning a voucher → its
  redeem page (loyalty or campaign). Reuses the chooser + numpad + result sheets.

## 8. Data migration (pre-launch clean cut — confirm §12)
- Create `apps.loyalty` with fresh migrations.
- `campaigns` migration: drop loyalty-specific fields/types (§3.2).
- Reseed demo: per business emit campaigns (1 individual challenge, 1 group, 1 social)
  AND loyalty programs (1 points/cashback, 1 stamp, 1 visit). No data backfill.
- Prod: additive loyalty app + a campaigns field-drop migration; pre-launch so a DB
  reset is acceptable if simpler.

## 9. Testing
- Loyalty: per-type earn (visit/stamp/spend-points), max_banked cap, redeem-points→
  cashback, stamp/visit completion→voucher, item selection, staff award w/ bill amount,
  business program CRUD (auth+permission+happy path), `django_assert_num_queries` on
  cards/members lists.
- Campaigns: existing suite minus loyalty; ensure challenge (time-bound) + group +
  social still pass.
- Unified scan: dispatch returns both loyalty + campaign sets; voucher routing.
- Frontend: RTL for loyalty cards/redeem, staff chooser, business loyalty create;
  keep campaign + group e2e green.

## 10. Phased implementation plan
1. **Backend loyalty app** — models + services + migrations + tests (no API yet).
2. **Backend loyalty API** — business/customer/staff endpoints + schema; trim
   `campaigns` (remove loyalty fields/endpoints) + tests.
3. **Unified staff scan** — `/api/staff/scan/` aggregator + loyalty award endpoint.
4. **Frontend api client** — split `loyalty` vs `campaigns` query keys/hooks/types;
   wallet aggregation.
5. **Customer** — Loyalty tab + Rewards(wallet) + Campaigns trim + nav rework + business page.
6. **Business** — Loyalty section (list/create/detail) + Campaigns create trim.
7. **Staff** — unified scan UI re-point.
8. **Seed/demo + e2e** verification.

## 11. Reuse map (what moves vs rebuilds)
- **Reused, re-pointed:** BusinessLoyaltyCard + switcher, ProgressDots, cashback/Use,
  PointsRedeemCard, VoucherItemSheet, staff LoyaltyChooserSheet + AmountSheet, voucher
  cards. Mostly import/endpoint swaps.
- **Moved backend logic:** points/stamp/visit earning, redeem-points, item selection,
  staff award-with-amount → from `campaigns` services into `loyalty` services.
- **New:** LoyaltyProgram/Membership/Transaction/Voucher models, loyalty business CRUD
  UI, unified scan aggregator.

## 12. Open sub-decisions (need your call)
1. **Customer nav** — §5.1 Option A (keep Home, Rewards = header wallet icon) vs B
   (drop Home; Loyalty·Rewards·Scan·Campaigns·Profile). *Recommend A.*
2. **Wallet aggregation** — client-merge two endpoints (recommended) vs a
   `/customer/wallet/` aggregator view.
3. **Spend challenges** — does an Individual *campaign* keep a spend-threshold variant
   ("spend 5000 this month → prize"), or are all spend mechanics loyalty-only? *Recommend
   campaigns = visit/action count only; spend lives in loyalty.*
4. **Data** — confirm pre-launch clean cut (no migration/backfill of existing
   loyalty-as-campaign rows). *Recommend clean cut.*
5. **Loyalty join** — does a customer explicitly "join" a loyalty program, or is the
   card auto-created on first staff award/visit? *Recommend auto-create on first earn.*
