# Loyalty / Campaigns Split — Implementation Plan (for Sonnet)

> **Read first:** the design rationale is in
> `docs/specs/2026-06-28-loyalty-campaigns-split-plan.md`. THIS doc is the
> step-by-step build plan. It is written to be unambiguous — follow it literally.
> Defer to `.claude/rules/backend.md` and `.claude/rules/frontend.md` for standards.

## 0. Resolved decisions (do NOT re-ask)

| # | Decision (final) |
|---|---|
| Domain | Loyalty app = ongoing programs (POINTS→cashback, STAMP, VISIT). Campaigns = time-bound Individual challenge + Group + Social. |
| Social | Stays a Campaign type. |
| Staff scan | One unified scan shows loyalty programs (choose-one) + campaign progress. |
| Customer nav | **Bottom nav (5): `Home · Loyalty · [Scan] · Campaigns · Profile`.** Rewards (earned-voucher wallet) is its own screen at `/rewards`, reached via a **gift/wallet icon in the top-right header** of Home + Loyalty (NOT a bottom tab). |
| Wallet | **Client-merge**: `/rewards` calls loyalty vouchers + campaign wallet and merges. No new aggregator endpoint. |
| Spend | Spend is **loyalty-only** (POINTS spend-basis). Individual campaigns are **visit/action count challenges only** (no spend threshold). |
| Data | **Pre-launch clean cut.** No backfill. Trim campaigns + add loyalty app + reseed. |
| Loyalty join | **Auto-create** the membership (card) on first staff award. ALSO allow a customer to "Join" from the business page (creates membership at 0 so the card shows immediately). |
| Branch base | Branch off **`feat/multi-form-loyalty`** (the loyalty UI to re-point lives there), NOT `main`. |

## 1. Phase 0 — Branch + isolated database + how to run

### 1.1 Branch
```bash
git checkout feat/multi-form-loyalty
git pull --ff-only 2>/dev/null || true
git checkout -b feat/loyalty-app-split
```
All work lands on `feat/loyalty-app-split`. Commit per task (Conventional Commits,
end every message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

### 1.2 Isolated Postgres database (do NOT touch the current dev DB)
The dev stack runs in Docker; its DB is `railway` on container `jaqyn-services-db-1`.
Create a SEPARATE database so the split's migrations/seed never clobber it:
```bash
docker exec jaqyn-services-db-1 psql -U postgres -d postgres \
  -c "CREATE DATABASE jaqyn_split OWNER postgres;"
```
Run all management commands for this work against `jaqyn_split` via an env override
on the existing web container (does not disturb the running server, which keeps using
`railway`):
```bash
docker exec -e POSTGRES_DB=jaqyn_split jaqyn-services-web-1 python manage.py migrate
docker exec -e POSTGRES_DB=jaqyn_split jaqyn-services-web-1 python manage.py seed_demo
```
For LIVE end-to-end (Phase 10) run a SECOND backend bound to `jaqyn_split` on port 8001
so the main stack stays untouched:
```bash
docker exec -d -e POSTGRES_DB=jaqyn_split -e PORT=8001 jaqyn-services-web-1 \
  sh -c "python manage.py runserver 0.0.0.0:8001"
# expose 8001: if not already published, instead run the runserver on the host:
#   cd backend && POSTGRES_DB=jaqyn_split POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5432 \
#   DJANGO_SETTINGS_MODULE=config.settings.dev python manage.py runserver 127.0.0.1:8001
```
Point the frontend preview at it: `API_PROXY_TARGET=http://127.0.0.1:8001 pnpm dev`.
(Backend unit tests always use the throwaway `config.settings.test` DB — unaffected.)

### 1.3 Acceptance for Phase 0
- `git branch --show-current` → `feat/loyalty-app-split`.
- `docker exec jaqyn-services-db-1 psql -U postgres -lqt | grep jaqyn_split` → present.
- `migrate` + `seed_demo` against `jaqyn_split` succeed; the main `railway` DB is unchanged.

## 2. Phase 1 — Backend: `apps.loyalty` models

Create `backend/apps/loyalty/` (apps.py, models.py, migrations/). Register in
`config/settings/base.py` INSTALLED_APPS after `apps.campaigns`.

**Exact models** (all money = `Decimal(max_digits=12, decimal_places=2)`; comment every
enum/constant with WHY per backend rules):

```python
class LoyaltyProgram(TimeStampedModel):
    class Type(TextChoices): POINTS="points"; STAMP="stamp"; VISIT="visit"
    class Status(TextChoices): ACTIVE="active"; PAUSED="paused"; ARCHIVED="archived"
    class PointsBasis(TextChoices): VISIT="visit"; SPEND="spend"
    class RewardType(TextChoices):
        FREE_ITEM="free_item"; DISCOUNT="discount"; UPGRADE="upgrade"; CASHBACK="cashback"
    class ItemSelection(TextChoices): FIXED="fixed"; CUSTOMER="customer"

    business = FK(Business, PROTECT, related_name="loyalty_programs")
    created_by = FK(User, SET_NULL, null=True)
    type = Char(choices=Type)            # the loyalty form
    status = Char(choices=Status, default=ACTIVE)
    name = Char(120); description = Text(blank=True); image = Image(null,blank)
    # POINTS
    points_basis = Char(choices=PointsBasis, null, blank)
    points_per_visit = PositiveInt(null, blank)        # visit-basis
    points_per_som = Decimal(null, blank)              # spend-basis (e.g. 0.05 = 5%)
    cashback_per_point = Decimal(null, blank)          # som per point at redemption
    min_redeem_points = PositiveInt(null, blank)       # floor to redeem
    # STAMP / VISIT
    required_count = PositiveInt(null, blank)          # stamps or visits to a reward
    max_banked = PositiveInt(null, blank)              # STAMP only
    # reward (STAMP/VISIT; POINTS pays out cashback)
    reward_type = Char(choices=RewardType, null, blank)
    reward_title = Char(160, blank); reward_description = Text(blank)
    reward_expiry_days = PositiveInt(default=30)
    item_selection = Char(choices=ItemSelection, null, blank)
    catalog_item = FK("businesses.CatalogItem", SET_NULL, null, blank, related_name="+")
    # optional active window (loyalty usually always-on)
    active_days = JSON(default=list, blank); active_start_time = Time(null,blank); active_end_time = Time(null,blank)
    class Meta: indexes=[Index(["business","status"]), Index(["status","type"])]

class LoyaltyMembership(TimeStampedModel):           # the customer's card
    class Status(TextChoices): ACTIVE="active"; INACTIVE="inactive"
    program = FK(LoyaltyProgram, CASCADE, related_name="memberships")
    customer = FK(User, PROTECT, related_name="loyalty_memberships")
    status = Char(choices=Status, default=ACTIVE)
    stamps_count = PositiveInt(default=0)            # STAMP progress in current cycle
    visits_count = PositiveInt(default=0)            # VISIT progress in current cycle
    points_balance = PositiveInt(default=0)          # POINTS
    current_spend = Decimal(default=0)               # SPEND-basis accumulation in cycle
    cycle = PositiveInt(default=0)                    # completed reward cycles
    joined_at = DateTime(auto_now_add); last_activity_at = DateTime(null,blank)
    class Meta: constraints=[UniqueConstraint(["program","customer"], name="uniq_loyalty_membership")]

class LoyaltyTransaction(UUIDModel):                  # immutable ledger
    class Kind(TextChoices): EARN="earn"; REDEEM="redeem"; ADJUST="adjust"; REVERSE="reverse"
    class Source(TextChoices): STAFF_SCAN="staff_scan"; ADMIN="admin"; SYSTEM="system"
    membership = FK(LoyaltyMembership, CASCADE, related_name="transactions")
    program = FK(LoyaltyProgram, PROTECT); customer = FK(User, PROTECT); business = FK(Business, PROTECT)
    kind = Char(choices=Kind); source = Char(choices=Source, default=STAFF_SCAN)
    points_delta = Int(null,blank); stamps_delta = Int(null,blank)
    bill_amount = Decimal(null,blank)
    staff = FK("staff.StaffMember", SET_NULL, null, blank)
    metadata = JSON(default=dict, blank); created_at = DateTime(auto_now_add, db_index=True)

class LoyaltyVoucher(UUIDModel):                      # earned redeemable reward
    class Status(TextChoices): ACTIVE="active"; REDEEMED="redeemed"; EXPIRED="expired"; CANCELLED="cancelled"
    membership = FK(LoyaltyMembership, CASCADE, related_name="vouchers")
    program = FK(LoyaltyProgram, PROTECT); customer = FK(User, PROTECT); business = FK(Business, PROTECT)
    voucher_code = Char(32, unique=True)
    status = Char(choices=Status, default=ACTIVE)
    reward_type = Char(choices=LoyaltyProgram.RewardType.choices)
    reward_title = Char(160, blank)
    cashback_amount = Decimal(null,blank)            # POINTS→cashback
    catalog_item = FK("businesses.CatalogItem", SET_NULL, null, blank, related_name="+")
    qr_token = FK("qr.QRCodeToken", SET_NULL, null, blank)
    issued_at = DateTime(auto_now_add); expires_at = DateTime(null,blank)
    redeemed_at = DateTime(null,blank); redeemed_by_staff = FK("staff.StaffMember", SET_NULL, null,blank)
    expiry_warned_at = DateTime(null,blank)
    class Meta: indexes=[Index(["customer","status"]), Index(["business","status"])]
```
Add a new QR token type `LOYALTY_REWARD` to `apps/qr` (mirror `CAMPAIGN_REWARD`).
Generate migrations via `DJANGO_SETTINGS_MODULE=config.settings.test python manage.py makemigrations loyalty qr`.

**Acceptance:** `makemigrations --check` clean; `migrate` against `jaqyn_split` OK;
`pytest apps/loyalty -q` (model tests below) green.

## 3. Phase 2 — Backend: loyalty services (`apps/loyalty/services/`)

- `program.py` `LoyaltyProgramService`: `create/update`, `pause/activate/archive`,
  `list_for_business`, publish validation (POINTS needs cashback_per_point>0 + a basis +
  the basis rate; STAMP/VISIT need required_count>0 + reward; item FIXED needs catalog_item).
- `membership.py`: `get_or_create_membership(program, customer)`; `card_view(program, customer)`
  returning a typed `@dataclass LoyaltyCardView` (type, progress/target or points_balance,
  reward summary, pct-back, joined).
- `earning.py` `LoyaltyEarningService.award(program, customer, staff, bill_amount=None, now=None) -> LoyaltyEarnResult`:
  - lock membership (`select_for_update`).
  - POINTS visit-basis → `points_balance += points_per_visit`.
  - POINTS spend-basis → require `bill_amount>0` (raise `ValidationError BILL_REQUIRED`) →
    `points_balance += floor(points_per_som × bill_amount)`; `current_spend += bill_amount`.
  - STAMP → `stamps_count += 1`; if `>= required_count` → mint voucher, `stamps_count -= required_count`
    (or reset, honoring `max_banked` cap on unredeemed vouchers), `cycle += 1`.
  - VISIT → `visits_count += 1`; same completion → voucher.
  - Always write a `LoyaltyTransaction`. Mint voucher via `redemption.mint_voucher`.
  - Side effects (`notify`) via `transaction.on_commit`. Return new balances + any voucher.
- `redemption.py`: `redeem_points(program, customer, points)` → CASHBACK voucher
  (`cashback_amount = points × cashback_per_point`, deduct balance, ledger REDEEM,
  `select_for_update`); `mint_voucher(...)` (FREE_ITEM/DISCOUNT/UPGRADE; FIXED sets
  catalog_item, CUSTOMER leaves null); `select_voucher_item(voucher, item, customer)`;
  `redeem_voucher(code, staff)` (ACTIVE→REDEEMED, guards expiry/ownership).
- `analytics.py`: per-program stat triplet (`@dataclass`): members, outstanding (points
  or active vouchers), redeemed.

**Acceptance / tests** (`apps/loyalty/tests/`): award each type incl. spend-basis math,
max_banked cap, stamp/visit completion→voucher, redeem_points→cashback + insufficient,
select_voucher_item (rejects other-business item), redeem_voucher, get-or-create idempotent.

## 4. Phase 3 — Backend: loyalty API + campaigns trim

### 4.1 Loyalty endpoints (exact)
Mount in `config/urls.py`: `path("api/business/loyalty/", include("apps.loyalty.business_urls"))`,
`path("api/customer/loyalty/", include("apps.loyalty.customer_urls"))`,
`path("api/staff/loyalty/", include("apps.loyalty.staff_urls"))`. All envelope = `{success,data,message}`.
All views: explicit `serializer_class`, `permission_classes`, paginate lists (default+hard max), throttle writes.

Business (`IsBusinessOwner`):
- `GET/POST /programs/` — list / create. **Create body**: `{type, name, description?, image?,
  points_basis?, points_per_visit?, points_per_som?, cashback_per_point?, min_redeem_points?,
  required_count?, max_banked?, reward_type?, reward_title?, reward_description?, reward_expiry_days?,
  item_selection?, catalog_item_id?, active_days?, active_start_time?, active_end_time?}`.
  List row: `{id, type, status, name, reward_summary, members, outstanding, redeemed}`.
- `GET/PATCH /programs/{id}/` — detail returns the full config + tab payloads
  `{overview, members:[{customer_name, state, joined_at}], transactions:[…], analytics:{stat_a,stat_b,stat_c}, settings}`.
- `POST /programs/{id}/pause/` · `/activate/` · `/archive/`.

Customer (`IsCustomer`):
- `GET /cards/` → `{results:[LoyaltyCardView]}` — all my cards across businesses (Loyalty tab).
  `LoyaltyCardView = {program_id, business_id, business_name, business_logo_url, type,
   name, reward_summary, joined, stamps_count, visits_count, required_count, points_balance,
   points_per_som, cashback_per_point, pct_back}`.
- `GET /programs/{id}/` → one card + history.
- `POST /programs/{id}/join/` → create membership at 0 (idempotent) → LoyaltyCardView.
- `POST /programs/{id}/redeem-points/` `{points}` → LoyaltyVoucher.
- `GET /programs/{id}/catalog/` → eligible CatalogItems (paginated).
- `GET /vouchers/` → `{active:[…], used:[…], expired:[…]}` LoyaltyVoucher rows (feeds /rewards).
- `POST /vouchers/{id}/select-item/` `{catalog_item_id}`.
- `GET /businesses/{business_id}/loyalty/` → that business's programs + my state (business-page section).

Staff (`IsStaff`):
- `POST /award/` `{token, program_id, amount?}` → award (the choose-one). `amount` required
  for spend-basis points; ignored otherwise. Returns `{customer, program_id, type,
  points_balance?, stamps_count?, visits_count?, required_count?, voucher?}`.
- `POST /redeem-voucher/` `{code}` → redeem a loyalty voucher.

### 4.2 Unified staff scan (`/api/staff/scan/`)
New top-level staff scan that aggregates BOTH apps. `POST /api/staff/scan/` `{token}` →
- customer → `{kind:"customer", customer:{name,phone_masked},
   loyalty:[LoyaltyScanRow], campaigns:[CampaignScanRow]}` where
   `LoyaltyScanRow = {program_id, name, type, reward_title, stamps_count, visits_count,
    required_count, points_balance, points_per_som, points_per_visit, cashback_per_point,
    pct_back, current_spend, needs_amount:bool}` and `CampaignScanRow` = the existing
    eligible-campaign row (campaign_id, name, eligible, reason_code, progress_count, required_count, mechanic="visit").
- voucher → `{kind:"voucher", domain:"loyalty"|"campaign", voucher}`.
- group invite → group check-in candidate. invalid → `{kind:"invalid", reason_code}`.
Confirm actions stay domain-specific (loyalty `/staff/loyalty/award/`; campaign
`/staff/campaigns/visit/`; group `/confirm-group/`; social `/confirm-social/`; redeem per domain).
Implement as a thin dispatcher service that calls into both apps' read services (loyalty
`card rows for customer at business`, campaigns `eligible_campaigns_for_customer`).

### 4.3 Campaigns trim (remove loyalty)
- `CampaignRule.Mechanic`: keep only `VISIT` (Individual challenge = visit/action count).
  Remove `STAMP`, `SPEND`, `POINTS` and the points_* / cashback_per_point / max_banked /
  required_spend / min_spend fields. Keep `required_count`, `max_count_per_day`,
  `minimum_time_between_actions`, group fields.
- `CampaignReward`: remove `CASHBACK`. Keep FREE_ITEM/DISCOUNT/UPGRADE/CUSTOM + item_selection/catalog_item.
- `CampaignParticipant`: remove `points_balance`, `current_spend`.
- `CampaignRewardVoucher`: remove `cashback_amount` (keep catalog_item).
- Remove endpoints: `/customer/campaigns/{id}/redeem-points/`, points fields on scan rows,
  the loyalty bits of `/customer/businesses/{id}/loyalty/` (that route MOVES to the loyalty app).
- Keep: feed, list/detail/join, group flow, social confirm, `campaign-wallet`, business
  list/detail/create (Individual challenge + Group + Social).
- Migration: a campaigns schema migration dropping the removed fields (pre-launch; safe to drop).

**Acceptance:** `pytest backend -q` green; OpenAPI/schema (if present) regenerated;
no remaining references to loyalty mechanics in campaigns.

## 5. Phase 4 — Frontend: api client split (`packages/api`)
- New `packages/api/src/loyalty/{types,api,hooks,adapters}.ts` exporting:
  types `LoyaltyType`, `LoyaltyCardView`, `LoyaltyVoucher`, `LoyaltyScanRow`, `LoyaltyProgramDetail`;
  hooks `useLoyaltyCards`, `useBusinessLoyalty(businessId)`, `useLoyaltyProgram(id)`,
  `useJoinLoyalty`, `useRedeemPoints`, `useLoyaltyCatalog(id)`, `useSelectVoucherItem`,
  `useLoyaltyVouchers`; business hooks `useBusinessLoyaltyPrograms`, `useCreateLoyaltyProgram`,
  `useLoyaltyProgramDetail`, pause/activate/archive; staff `useLoyaltyAward`, `useRedeemLoyaltyVoucher`.
  Query keys under a `loyalty` factory. Parse via adapters (the repo's boundary pattern; no zod).
- `packages/api/src/staff`: `useUnifiedScan` → `/api/staff/scan/` returning `{loyalty,campaigns}`.
- Remove the loyalty hooks/types/fields that lived in `customer/*` (redeem-points,
  business-loyalty, points fields on Campaign) — they move to `loyalty/*`.
- Export the new module from the package entry.

**Acceptance:** `pnpm --filter @jaqyn/api typecheck` + tests green.

## 6. Phase 5 — Frontend: customer UI

### 6.1 Navigation (`app/_components/BottomNav.tsx`)
- Bottom nav order: **Home · Loyalty · [Scan center] · Campaigns · Profile**. Replace the
  current "Rewards" tab with "Loyalty" (`/loyalty`, icon: stamp/card). Keep Scan center,
  Campaigns, Profile, Home.
- Add a **gift/wallet icon button** in the top-right header of Home and Loyalty screens →
  links to `/rewards`. i18n labels: `nav.loyalty` ("Loyalty"/"Лояльность"), keep `nav.campaigns`
  (Акции), `nav.rewards` stays the wallet screen title.

### 6.2 Loyalty tab (`app/loyalty/page.tsx` — NEW, move logic from old /rewards in-progress)
- Title "Your loyalty cards" / "Ваши карты лояльности" + subtitle (reuse
  `cmp.wallet.loyaltyTitle`/`loyaltySubtitle`). Data: `useLoyaltyCards()`.
- One `BusinessLoyaltyCard` per business (REUSE the existing component from
  `_components/campaigns.tsx` — move it to `_components/loyalty.tsx` and re-point its
  prop types to `LoyaltyCardView`). Card keeps the segmented switcher + stamp/visit dots +
  cashback "Use" + type pill exactly as built. Card detail link → `/loyalty/[programId]`.
- Empty state: "No loyalty cards yet — collect stamps and points at places you visit."
- `loading.tsx` + `error.tsx`.

### 6.3 Loyalty card detail (`app/loyalty/[id]/page.tsx` — NEW)
- Reuse `PointsRedeemCard` (move to loyalty) for POINTS; show dots/progress for STAMP/VISIT;
  reward block; history (transactions). CTA per type. Data `useLoyaltyProgram(id)`.

### 6.4 Rewards/wallet (`app/rewards/page.tsx` — becomes pure wallet)
- Title "Rewards" / "Награды" + subtitle "Rewards you've earned — show to staff to use."
- Merge `useLoyaltyVouchers()` + `useCampaignWallet()` client-side into Active/Used/Expired
  (sort Active by soonest expiry). Render existing `VoucherCard`/`VoucherRow`; loyalty
  cashback vouchers show "{amount} som cashback", item vouchers show item name; campaign
  vouchers unchanged. Voucher present + item-selection sheets reused.
- REMOVE the in-progress loyalty cards section from here (now on the Loyalty tab).

### 6.5 Campaigns tab (`app/campaigns/page.tsx` — trim)
- Remove loyalty/points cards from the feed. Feed = Individual challenges + Group + Social
  + the "active group" banner. `CampaignCard`/`CampaignCarouselCard` keep type pill +
  accent for individual/group/social (no points variant). Discover chips unchanged.

### 6.6 Business page (`app/nearby/[id]` / BusinessDetailsContent)
- The loyalty section's `BusinessLoyaltyCard` now sourced from `useBusinessLoyalty(id)` in
  the loyalty module. Add a "Join" affordance (calls `useJoinLoyalty`) when not a member so
  the card starts at 0. Campaigns shown separately (existing). NOTE: a `BusinessSheet`/
  `BusinessDetailsContent` refactor already exists in the tree — integrate with it, don't fight it.

**UI copy:** every new string via `@jaqyn/i18n` with EN+RU. Reuse existing `cmp.loyalty.*`
keys; add `nav.loyalty`, `loyalty.empty`, `loyalty.join`, `rewards.subtitle` as needed.

**Acceptance:** `pnpm typecheck` + `pnpm lint` green; RTL tests: Loyalty tab renders one
card per business; Rewards merges loyalty+campaign vouchers; Campaigns feed has no points card.

## 7. Phase 6 — Frontend: business UI (loyalty section)
- Sidebar (`OwnerShell`): add **Loyalty** between Campaigns and Rewards/Redemptions.
- `app/business/loyalty/page.tsx` — list programs (type badge + 3 stats + reward), filter by
  type (All/Points/Stamp/Visit) and status. `useBusinessLoyaltyPrograms`.
- `app/business/loyalty/new/page.tsx` — create flow: Step 1 type chooser (Points / Stamp /
  Visit, outcome wording: "Cashback / points", "Stamp card", "Visit reward"); Step 2 adaptive
  form:
  - Points: basis toggle (Per visit / Per spend) → `points_per_visit` OR `points_per_som`
    (+ a "% back" helper computed from points_per_som×cashback_per_point), `cashback_per_point`, `min_redeem_points`.
  - Stamp: `required_count`, `max_banked`, reward (FREE_ITEM/DISCOUNT + item_selection: Fixed
    `CatalogItem` picker via `useCatalog`, or Customer-choice), `reward_expiry_days`.
  - Visit: `required_count`, reward (same as stamp).
  Submit → `useCreateLoyaltyProgram`.
- `app/business/loyalty/[id]/page.tsx` — detail tabs: Overview · Members · Transactions ·
  Reward Usage · Analytics · Settings. Pause/Activate/Archive actions.
- Reuse the business campaign create-form patterns; this mirrors them.

**Acceptance:** typecheck/lint green; RTL: create form shows the right fields per type;
list filters work.

## 8. Phase 7 — Frontend: staff unified scan
- `app/staff/scan/page.tsx`: on customer scan, call `useUnifiedScan`. Render TWO sections in
  the result sheet: **Loyalty** (the choose-one chooser + per-row actions + bill numpad —
  REUSE `LoyaltyChooserSheet`/`AmountSheet`/`SingleResultSheet`, re-pointed to
  `useLoyaltyAward`) and **Campaigns** (eligible Individual/Group rows → `/staff/campaigns/visit/`
  or group check-in). Voucher scan → its redeem page (loyalty or campaign by `domain`).
- Keep one-tap row actions; points opens the numpad; success sheet per action.

**Acceptance:** typecheck/lint green; staff RTL: scanning a customer shows loyalty chooser
+ campaign rows; loyalty points award sends `amount`; campaign visit advances.

## 9. Phase 8 — Seed + end-to-end verification (against `jaqyn_split`)

### 9.1 Seed (`seed_demo`)
Per demo business emit BOTH: campaigns (1 Individual challenge w/ end date, 1 Group, 1 Social)
AND loyalty programs (1 Points/cashback spend-basis 5% back, 1 Stamp "buy 6 get 1 free",
1 Visit "3 visits → 20% off"). Give one demo customer a started card on each.

### 9.2 Backend E2E smoke (Django APIClient in container, `SERVER_NAME='localhost'`, DB=jaqyn_split)
Run a script asserting, end to end:
1. Business owner creates each loyalty type via `POST /api/business/loyalty/programs/` → 201.
2. Customer `GET /api/customer/loyalty/cards/` → shows the programs (auto/joined).
3. Staff `POST /api/staff/scan/` with the customer token → returns `loyalty[]` + `campaigns[]`.
4. Staff `POST /api/staff/loyalty/award/` points spend-basis `amount=1000` → balance +50.
5. Staff award stamp ×6 → a LoyaltyVoucher minted; `GET /customer/loyalty/vouchers/` shows it.
6. Customer `POST /redeem-points/` → cashback voucher; appears in `/vouchers/`.
7. Campaign still works: join an Individual challenge, staff `/campaigns/visit/` advances; group flow; social confirm.
8. `/rewards` data = loyalty vouchers + campaign vouchers merged.
Capture pass/fail for each.

### 9.3 Frontend E2E (preview pointed at :8001 / jaqyn_split)
Drive with the preview tools (mobile viewport, inject JWT via `/api/auth/login-password/`
`{email,password}`):
- Customer: Loyalty tab shows one card per business w/ switcher; redeem points → cashback in Rewards;
  Campaigns feed has challenges/groups/social (no points card); nav shows Home·Loyalty·[Scan]·Campaigns·Profile + header wallet icon → /rewards.
- Business: Loyalty section lists + create each type; detail tabs.
- Staff scan UI is camera-gated → verify via the staff RTL + the backend award smoke above.
Take screenshots of: Loyalty tab, a loyalty card detail, Rewards wallet (merged), business
loyalty list + create, campaigns feed.

### 9.4 Final gates
`pytest backend -q` green; `pnpm -w typecheck && pnpm -w lint && pnpm -w test` green.

## 10. Per-phase commit list (suggested)
1 docs (this) → 2 loyalty models+migration → 3 loyalty services+tests → 4 loyalty API +
campaigns trim + tests → 5 unified staff scan → 6 FE api split → 7 customer UI → 8 business UI →
9 staff UI → 10 seed + e2e fixes.

## 11. Definition of done
- Loyalty fully in `apps.loyalty`; campaigns has zero loyalty mechanics.
- Customer: Loyalty tab, Rewards wallet (merged), Campaigns feed — all per §6.
- Business: separate Loyalty + Campaigns sections.
- Staff: one scan → loyalty award (incl. bill amount) + campaign progress.
- All gates green; E2E smoke (§9) passes on the isolated `jaqyn_split` DB; the main dev DB
  (`railway`) untouched.

## 12. Cleanup after verification
- Drop the scratch DB when done: `docker exec jaqyn-services-db-1 psql -U postgres -d postgres -c "DROP DATABASE jaqyn_split;"`
- Do NOT merge to main without the user's go-ahead.
