# Tech Spec: Banking Rewards (Rewards Wallet)

Implements the design in `docs/banking-rewards-design-brief.md`. Completed cards mint reward
vouchers that **bank and stack**; customers redeem them one at a time, later, by "presenting"
one and having staff scan their personal QR.

Stack: Django + DRF backend (`backend/`), Next 14 + react-query frontend (`frontend/`, pnpm
monorepo: `apps/web`, `packages/api`, `packages/i18n`). App runs live by default
(`NEXT_PUBLIC_USE_MOCKS` opt-in) — every new api method needs live **and** mock impls.

---

## 1. Data model changes (`backend/apps/loyalty/models.py`)

### RewardRedemption (the bankable voucher)
Already: `customer, business, reward_program, progress(FK), code, status(pending|redeemed|expired|cancelled), redeemed_by, redeemed_at, expires_at, created_at`. Multiple PENDING per customer already allowed (no unique constraint).
- **ADD** `presented_at = DateTimeField(null=True, blank=True)` — set when the customer taps "Use"; disambiguates earn vs redeem on a staff scan.
- **CHANGE** `progress` → `null=True, blank=True` (forward-compat for grant-style rewards: welcome/birthday/coupon have no card progress).

### CustomerRewardProgress
Already: unique `(customer, business, reward_program)`, `status, current_count, current_spend, target_count, unlocked_at, expires_at`.
- **ADD** `completed_count = PositiveIntegerField(default=0)` — how many vouchers this card has minted (analytics + "earned 3×").
- **Behavior change** (no schema): progress now stays `ACTIVE` permanently for repeatable types. `UNLOCKED`/`REDEEMED` statuses become legacy (kept in enum, unused by the new flow).

### Settings (`config/settings/base.py`)
- `REWARD_PRESENT_TTL_SECONDS = int(os.getenv("REWARD_PRESENT_TTL_SECONDS", "120"))` — how long a presented voucher stays redeemable.

### Migration
One migration: `presented_at` (+ `progress` nullable) on RewardRedemption, `completed_count` on CustomerRewardProgress. Apply to docker postgres after generating (`docker compose exec web python manage.py migrate`).

---

## 2. Backend service logic (`backend/apps/loyalty/services.py`)

### `staff_collect(staff, raw_token, amount=None, program_id=None, request=None)` — rewrite the tail
New order:
1. Resolve `customer_profile` token (unchanged).
2. **Redeem branch (NEW, replaces the old UNLOCKED check):** find the customer's most-recent
   PENDING redemption for `staff.business` with `presented_at >= now - REWARD_PRESENT_TTL` and
   not expired. If found → return `reward_ready` for THAT voucher (no stamp awarded). Staff
   confirms it via the existing redeem endpoint.
3. If spend program & `amount is None` & not redeeming → `needs_amount` (unchanged).
4. **Award branch (mint + reset, never "stuck"):** `get_or_create` progress (always ACTIVE).
   - **count (stamp/visit):** `current_count += 1`; record EARNED txn. If `current_count >= target`:
     mint `create_redemption(progress)`, `current_count = 0`, `completed_count += 1`, record UNLOCKED txn. (One scan ⇒ at most one voucher.)
   - **spend:** `current_spend += amount`; record EARNED txn. `minted = 0`; **while** `current_spend >= required_spend`:
     mint voucher, `current_spend -= required_spend`, `completed_count += 1`, `minted += 1`. (Big purchase ⇒ several vouchers.)
   - Return `awarded` with **`rewards_earned: <int>`** (0, 1, or more) so the UI can celebrate. Progress stays ACTIVE.
   - Remove the old `if progress.status != ACTIVE: …` idempotency branch and the UNLOCKED→reward_ready completion return.

### `redeem_reward(staff, code=None, token=None, request=None)` — adjust
- On success: set redemption `REDEEMED`, `redeemed_by/redeemed_at`, **clear `presented_at`**, record the STAFF_MANUAL txn. **Remove** `redemption.progress.status = REDEEMED` (progress must stay ACTIVE so earning continues). Everything else (WRONG_BUSINESS, already-redeemed, expired) unchanged.

### `create_redemption(progress)` — unchanged
Still mints a `RewardRedemption` + a `REWARD_REDEEM` QR token. (The QR token is now optional to the
flow since redeem goes through the personal QR + presented voucher, but keep it — harmless, and
supports a fallback "scan the voucher" path.)

### New: `present_redemption(customer, redemption_id)`
- Validate the redemption belongs to `customer`, is PENDING, not expired.
- Set `presented_at = now`. **Clear `presented_at` on the customer's other redemptions** (only one active at a time). Return the redemption.

### New: `customer_wallet(customer)`
Return `{ available: [...], in_progress: [...] }`:
- **available** — PENDING, non-expired redemptions grouped by `(business, reward_program)`:
  `{business:{id,name}, reward:{id,title,description}, count, soonest_expiry, redemption_ids:[...]}`.
- **in_progress** — ACTIVE progress: `{business, reward_program, type, current_count, target_count, current_spend, required_spend, completed_count}`.

---

## 3. API endpoints

| Method & path | Auth | Body / returns |
|--|--|--|
| `GET /api/customer/wallet/` | IsCustomer | → `{available:[...], in_progress:[...]}` (see `customer_wallet`) |
| `POST /api/customer/redemptions/<id>/present/` | IsCustomer | → updated redemption `{id, code, status, presented_at, expires_at, reward_description, business_name}` |
| `POST /api/staff/collect/` | IsStaff | `{token, amount?, program_id?}` → existing `StaffCollectResult` + new `rewards_earned:int` on `awarded`; `reward_ready` now also fires for a presented voucher |
| `POST /api/staff/redeem/` | IsStaff | unchanged `{code}` (or token) — now leaves progress ACTIVE |

Views in `backend/apps/loyalty/views.py` (customer) and reuse `backend/apps/staff/views.py`
(`StaffCollectView` already wraps `staff_collect`; just returns the augmented dict). Wire customer
routes in `apps/loyalty/urls.py` / the customer urls module. Use `success_response(...)`.

### Serializer additions (`apps/loyalty/serializers.py`)
- `WalletRewardSerializer` (grouped voucher), `WalletSerializer` ({available, in_progress}).
- `RewardRedemptionSerializer` — add `presented_at`.

---

## 4. Frontend — api layer (`frontend/packages/api/src`)

### `customer/types.ts`
- `Redemption` — add `presented_at: string | null`.
- `WalletReward = { business:{id,name}; reward:{id,title,description}; count:number; soonest_expiry:string|null; redemption_ids:string[] }`.
- `Wallet = { available: WalletReward[]; in_progress: RewardProgress[] }`.

### `customer/api.ts` (live + `mockCustomerApi`)
- `wallet(): Promise<Wallet>` → `GET /api/customer/wallet/`.
- `presentRedemption(id: string): Promise<Redemption>` → `POST /api/customer/redemptions/${id}/present/`.
- Mock: derive `available` by grouping `mockRedemptions` (status pending); `in_progress` from `mockProgress`; `presentRedemption` stamps a `presented_at`.

### `customer/hooks.ts`
- `useWallet(opts?)` (poll-able via `refetchInterval`), `usePresentRedemption()` (invalidates `wallet` + `me`).

### `staff/types.ts`
- `StaffCollectResult` — add `rewards_earned?: number` (present on `awarded`).

---

## 5. Frontend — screens (`frontend/apps/web/app`)

### Customer
- **`rewards/page.tsx` → wallet redesign:** two sections — **Ready to use** (`useWallet().available`,
  grouped cards with `×count`, expiry hint, **Use** button) and **In progress** (`in_progress` cards:
  stamp dots / spend bar). Poll `useWallet({refetchInterval:3000})`.
- **`rewards/[id]/page.tsx` (or a `present` route) → redeem flow:** **Use** → `usePresentRedemption(id)` →
  show reward badge + personal QR (`useMyQr`) + "Show this to staff" + pulsing "Waiting…" + a
  **countdown to TTL** → poll the redemption/wallet; when that voucher becomes `redeemed` → "Redeemed!"
  celebration → back to wallet. Cancel/back returns it (let `presented_at` lapse).
- **`qr/page.tsx` / home — completion celebration:** poll `useWallet`/`useRewards`; when a card's
  `completed_count` increases (or a new voucher appears) → transient **"🎁 Reward earned! …added to your
  rewards"** + card visibly at 0/6.

### Staff (`apps/web/app/staff/scan/page.tsx`)
- `awarded` overlay: when `result.rewards_earned > 0`, append a **"🎁 Reward earned"** line under the
  stamp dots / spend bar (and "+N" if >1). Keep auto-dismiss + countdown bar.
- `reward_ready` overlay: unchanged visually — now also triggered by a presented voucher.

### i18n (`packages/i18n/src/locales.ts`, en+ru)
`rewards.readyToUse`, `rewards.inProgress`, `rewards.use`, `rewards.useBy`, `rewards.empty`,
`rewards.earned` ("Reward earned"), `rewards.earnedBanked` ("added to your rewards"),
`redeem.presenting`, `redeem.waiting`, `redeem.timer`, `redeem.done`, `staff.scan.rewardEarned`.
No interpolation — format counts/×N in-component.

---

## 6. Tests

**Backend** (`apps/staff/tests`, `apps/loyalty/tests`):
- stamp completion mints a voucher, resets count to 0, progress stays ACTIVE; filling again mints a 2nd (stacking).
- spend purchase ≥ 2× threshold mints 2 vouchers + carries remainder.
- present a voucher → staff scan returns `reward_ready` for it → redeem → voucher REDEEMED, leaves wallet, in-progress card untouched & still ACTIVE.
- staff scan with banked-but-not-presented rewards → still `awarded` (earns a stamp).
- presented voucher past TTL → not `reward_ready` (falls through to earn).
- wallet endpoint groups available vouchers with correct `count`.
- redeem no longer flips progress to REDEEMED.

**Frontend:** typecheck + lint; runtime smoke (wallet renders grouped, Use→present→redeem flips to Redeemed).

---

## 7. Phased implementation plan

**Phase 0 — contract lock (orchestrator).** Freeze the JSON shapes above (wallet, present, collect `rewards_earned`) in a contract doc so backend & frontend align.

**Phase 1 — parallel (two agents, disjoint trees):**
- **Backend agent (`backend/` only):** model fields + migration + settings; rewrite `staff_collect` (redeem branch, mint+reset, spend-loop, `rewards_earned`); adjust `redeem_reward`; add `present_redemption` + `customer_wallet`; serializers; customer endpoints/urls; tests; run `pytest apps/staff apps/loyalty` + `migrate` on docker.
- **Frontend foundation agent (`packages/` only):** types, `wallet`/`presentRedemption` (live+mock), `useWallet`/`usePresentRedemption`, `rewards_earned` on StaffCollectResult, i18n keys; package typechecks.

**Phase 2 — parallel (two agents, disjoint app dirs):**
- **Customer screens agent (`apps/web/app/{rewards,qr}` + customer components):** wallet redesign, present→redeem flow, completion celebration.
- **Staff overlay agent (`apps/web/app/staff`):** `rewards_earned` line in the Awarded overlay.

**Phase 3 — integration (orchestrator):** migrate docker DB; `pnpm --filter web typecheck` + `lint`; runtime smoke on live :3000 — earn past one card (stacks), present a reward, staff-scan to redeem, confirm wallet decrements and the card keeps earning.

---

## 8. Risks / decisions
- **Redeem intent = customer-initiated — CONFIRMED.** The customer chooses *when* to use each gift.
  Banked vouchers sit in the wallet indefinitely (until `expires_at`, if the business set one) and
  **nothing ever auto-redeems**. A reward is only consumed after the customer taps "Use" to present it
  *and* staff confirms the scan. No staff-side reward picker. A staff scan with no presented voucher
  always just earns progress — never spends a banked gift.
- **Spend remainder carry** — chosen (fairer). Alternative: reset to 0 (forfeit remainder) — simpler, but worse UX.
- **Legacy `progress.status` (UNLOCKED/REDEEMED)** — left in the enum, unused. The old customer-self-scan `collect_from_qr` path still uses them; it's unused by the live flow but not deleted.
- **`already_counted`** state — already dead (cooldown removed earlier); not reintroduced.
- **Concurrency** — keep `select_for_update` on the progress row in the award branch (already there) so the spend-loop and count increments are atomic.

---

## Addendum v2 — gift cap, per-business reward card with history, tap-to-ask-staff

Three additions. They amend §1–§7 above.

### A. Cap on banked (unused) gifts — business-defined
**Model (§1):** `RewardProgram.max_banked = PositiveIntegerField(null=True, blank=True)` — max
*unredeemed* vouchers a customer may hold for this program. **The business sets this per program;
when left empty it is unlimited.** No global default / env setting — the cap is purely
`program.max_banked` (null ⇒ no cap).

**Expiry is likewise business-defined and already modelled:** `RewardProgram.expiry_days`
(existing, null=True). The business sets it per program; null ⇒ vouchers never expire.
`create_redemption` already derives `expires_at` from it (null when unset). No global default.

**Business config surface:** add `max_banked` (and ensure `expiry_days`) to the reward-program
create/edit path — `create_reward_program()` / the program serializer in `apps/loyalty` and the
business reward-program form (`apps/web/app/business/...`). Both optional; empty = unlimited/never.

**Logic (§2, `staff_collect` award branch):** before minting on completion, count the customer's
PENDING non-expired vouchers for `(customer, business, program)`.
- Under cap (or no cap) → mint + reset as specified (spend-loop re-checks the cap each iteration and stops minting when hit).
- At cap → **don't mint, hold the card full**: clamp `current_count = target` (or `current_spend = required_spend`), do **not** reset, and return `awarded` with **`bank_full: true`** (+ whatever `rewards_earned` minted before the cap was hit). The card is "full — redeem one to keep earning."

**Resume on redeem (eager):** in `redeem_reward`, after a voucher is redeemed and a slot frees, if
the customer has a held-full card for that program and is now under cap → mint a voucher from it
and reset it (so the earned reward isn't lost). Keep it inside the same `select_for_update` txn.

**Tests:** at cap, completion returns `bank_full` and mints nothing; redeeming one frees a slot and
the held card mints on redeem; spend-loop stops at the cap and carries the remainder.

### B. Per-business reward card: unused + redeemed history
Entry point is **per business** — the Rewards list shows a card per business/program; tapping one
opens its detail.

**Endpoint (§3):** `GET /api/customer/businesses/<business_id>/rewards/` (IsCustomer) →
```json
{
  "business": {"id","name","area"},
  "programs": [{"id","type","title","reward_description","current_count","target_count",
                "current_spend","required_spend","completed_count","available_count","bank_full"}],
  "available": [{"id","reward_title","reward_description","expires_at","created_at"}],   // unused, PENDING
  "history":   [{"id","reward_title","status","redeemed_at","created_at"}]               // REDEEMED + EXPIRED, newest first
}
```
`available` = the **unused** gifts (tappable → present). `history` = **redeemed/expired** gifts with
dates. Serializer (§3): extend `RewardRedemptionSerializer` with `presented_at, redeemed_at, status,
reward_title` (from `reward_program.title`). Service: `business_reward_card(customer, business_id)`.

**Screen (§5):** new `apps/web/app/rewards/[businessId]/page.tsx` (or `rewards/business/[id]`):
- Card progress (stamp dots / spend bar, `completed_count` "earned N times").
- **"Unused (×N)"** section — each voucher tappable → present (see C).
- **"History"** section — redeemed (✓, date) and expired (greyed, date) gifts.
- Poll while open so a redeem reflects live.
The Rewards wallet (§5 `rewards/page.tsx`) links each business card here.

### C. Tap an unused gift → ask staff to give it
Tapping an unused voucher calls `usePresentRedemption(id)` (§4) and routes to the present screen
(§5 redeem flow): reward badge + personal QR + **"Ask staff to give it to you — show this and
they'll confirm"** + the TTL countdown + "Waiting…" → flips to **"Redeemed!"** when staff confirms,
then the voucher moves from **Unused → History**. Copy key: `redeem.askStaff`.

### Plan delta (§7)
- Backend agent also: `max_banked` field (business-defined, null=unlimited; expose `max_banked`
  +`expiry_days` on the reward-program create/edit serializer), bank-full logic + eager
  resume-on-redeem, `business_reward_card` service + endpoint, serializer history fields, tests.
- Frontend foundation agent also: `BusinessRewardCard` type, `useBusinessRewardCard(businessId)` hook,
  `bank_full` on `StaffCollectResult.awarded`, the new i18n keys (`rewards.unused`, `rewards.history`,
  `rewards.earnedTimes`, `rewards.bankFull`, `redeem.askStaff`, `staff.scan.bankFull`).
- Customer screens agent also: the per-business detail screen (unused + history + tap-to-present) and
  wallet→detail links.
- Business reward-program form (`apps/web/app/business/...`): two optional inputs — **"Gift expiry
  (days)"** → `expiry_days` and **"Max gifts a customer can hold"** → `max_banked`; both empty =
  unlimited/never. (Small add; bundle with the customer-screens agent or a dedicated business-form task.)
- Staff overlay agent also: show **"Card full — customer should redeem one"** when `bank_full` (gentle,
  not an error).

