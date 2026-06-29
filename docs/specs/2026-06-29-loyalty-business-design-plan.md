# Loyalty (Business) redesign — design-match plan

Branch: `feat/loyalty-business-design`. Reference: `Jaqyn Loyalty (standalone).html`
(3 pages × 4 states). Goal: business loyalty UI matches the Claude Design export
exactly, end-to-end against the real API.

## Pages in the design

1. **List** — `/business/loyalty`
2. **Detail** — `/business/loyalty/[id]` — tabs: Overview · Members · Transactions ·
   Reward Usage · Analytics · Settings
3. **Create** — `/business/loyalty/new` — 4-step wizard: **Type → Mechanics → Reward → Review**

## Backend gaps (existing endpoint, no new URLs)

All three land in `GET /api/business/loyalty/programs/{id}/`
(`BusinessProgramDetailView.get`). FKs already exist on the models.

1. **Transactions need member name.** `LoyaltyTransactionSerializer` → add
   `customer_name = CharField(source="customer.name")`. `select_related("customer")`
   in the detail query (already `select_related("staff")`).

2. **Reward Usage needs a voucher list.** Detail returns counts only. Add a
   `vouchers` array (recent 100, mirrors the 100-cap already used for transactions):
   `{ voucher_code, customer_name, status, issued_at, reward_title }`. Source from
   `LoyaltyVoucher.objects.filter(program=program).select_related("customer")`.
   ponytail: cap at 100; add a paginated voucher endpoint only if a program outgrows one view.

3. **Analytics needs two real metrics.** `LoyaltyAnalyticsService.for_program` →
   add `new_members_30d` (memberships joined in last 30 days) and `repeat_rate`
   (members with >1 earn txn ÷ members). Keep members/outstanding/redeemed. Drop the
   placeholder `stat_a/b/c` mapping in the view; return named fields.

Everything else the design shows (redemption rate, avg-stamp/point/visit meter,
"X mo member", Collecting/Reward-ready status) is **computed client-side** from
`members[].state` + `joined_at` + counts already in the payload. No backend work.

## Frontend

- `packages/api/src/loyalty/types.ts` — extend `BusinessLoyaltyProgramDetail`:
  `vouchers[]`, named `analytics` (`members, outstanding, redeemed, new_members_30d, repeat_rate`),
  `LoyaltyTransaction.customer_name`.
- **List** — KPI cards get icon tiles + sub-captions; program cards get a status accent
  bar, type+status badges, name, 3-stat box, reward-summary + "Open ›" footer.
- **Detail** — solid terracotta hero (`bg-brand`, not the dark gradient) with inline
  `N members · N outstanding · N redeemed` and Pause/Archive in the hero.
  - Overview: 4 stat cards (Members · Vouchers outstanding|Points balance · Rewards
    redeemed · Redemption rate) + type-aware LOYALTY METER (stamp grid / points bar /
    visit ring) + THE REWARD card with "Valid N days" + "1 active reward" chips.
  - Members: avatar + name + relative join, `n / m` progress, Collecting/Reward-ready badge.
  - Transactions: KIND badge · MEMBER · AMOUNT (signed/colored) · DATE.
  - Reward Usage: voucher table (CODE · CUSTOMER · ISSUED · STATUS).
  - Analytics: Repeat visit rate · New members (30d) · type-specific metric.
  - Settings: Review-style rows (Type, Earn basis, Rate, Cashback, Min to redeem, Voucher validity).
- **Create** — 4-step wizard matching the design copy; POST payload unchanged.
- `packages/i18n/src/locales.ts` — new keys (RU + EN).

## Tests
- Backend: detail endpoint returns `vouchers` + analytics fields; transaction has
  `customer_name`; query-count assertion (no N+1).
- Frontend: existing component tests adjusted for new structure.
