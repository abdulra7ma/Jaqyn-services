---
title: Customer home redesign — hero + rails
service: frontend
type: spec
status: active
last_reviewed: 2026-07-03
---

# Customer home redesign — "Hero + rails"

Replace the authed customer home (`frontend/apps/web/app/page.tsx`, `AuthedHome`)
with a hook-driven layout: one hero card, horizontal rails, never-empty new-user
state. Design approved in-session (2026-07-03). No backend changes.

## Problems being fixed

- Busy, text-heavy; full `CampaignCard`s duplicate `/campaigns` on home.
- No reference to the loyalty wallet (`/loyalty`) or campaign wallet (`/campaign-wallet`).
- "Мой QR" duplicated (header button + center bottom-nav scan button).
- No retention hook; new customers see a near-empty page with no path to a business.

## Layout (top → bottom)

### 1. Header
Greeting + name (as today) + **avatar on the right → `/profile`** (use
`me.data.user` avatar if present, else initials tile per §8 of design system).
**Delete the 3-button row** (`/rewards` gift, `Рядом`, `MyQrButton`). QR lives
only in the bottom-nav center scan button. Keep `MyQrButton`/`QrSheet` component
untouched — other screens may use it.

### 2. Hero "next reward" card — the retention hook
One large card, full-bleed gradient, Bricolage display type. Selection is a
**pure exported helper `pickHero()`** (unit-testable, lives next to the page or
in `app/_lib/`), fed by data already fetched:

Inputs: `useCampaignWallet().active`, `useLoyaltyVouchers().active` (add hook
call), `useCampaignFeed().followed`, `useLoyaltyCards()` (joined only).

Priority:
1. **Expiring voucher** — any campaign voucher with `expiring_soon === true`,
   else any loyalty voucher with `expires_at` within 3 days (3 = same window the
   backend uses for `expiring_soon`; comment it). Variant: amber urgency pill +
   `expires_label`/date, reward title, business name. Tap → `/campaign-wallet`
   (campaign voucher) or `/rewards` (loyalty voucher).
2. **Closest to reward** — min steps remaining across:
   - joined stamp/visit loyalty cards: `required_count - max(stamps_count, visits_count)`
     (only cards with `required_count`), tap → `/loyalty/[program_id]`;
   - followed campaigns with `my_progress` and `target_count`:
     `target_count - current_count`, tap → `/campaigns/[id]`.
   Remaining must be ≥ 1; ties → fewest remaining, then loyalty card first.
   Shows: reward title ("Бесплатный кофе"), progress bar (§9 bar spec),
   "Остался 1 визит" line, business name.
3. **New-user variant** — no vouchers, no joined cards, no followed campaigns:
   "Начните зарабатывать" card with scan CTA (→ `/scan`) and a line pointing to
   the discover rail below.

Visual: wallet-gradient background (`bg-wallet-*` classes; reuse the existing
accent-from-`business_card_accent`-with-hash-fallback helper used by `/loyalty`
— import/extract it, don't duplicate). New-user variant uses `bg-brand-gradient`.

### 3. Wallet peek rail
Section header "Кошелёк" + "Все" link → `/loyalty`. Horizontal snap-scroll of
mini wallet cards (compact ~w-40 versions of the /loyalty gradient cards:
gradient, business name, balance/stamps line). Data: `useLoyaltyCards()` joined
cards. Hidden when no joined cards.

### 4. Expiring-soon strip
Slim horizontal row of campaign vouchers with `expiring_soon`, excluding the one
shown in the hero. Amber pill + `expires_label`. Tap → `/campaign-wallet`.
Hidden when empty.

### 5. Discover rail
Section header "Откройте новое" + link → `/nearby`. Horizontal cards of
businesses deduped from `useCampaignFeed().discover[].business` (no geolocation
prompt on home): logo/initials tile, name, category, area. Tap →
`/nearby/[id]`. **Always rendered** when discover businesses exist — this is
the new-user filler. If discover is empty too, show the §10 empty-state card
linking to `/nearby`.

### 6. Compact campaigns row
Shrink today's dark Акции banner to a one-line list-row (icon tile + "Акции" +
chevron, §8 list-row) → `/campaigns`. Keep the existing dark gradient tile ONLY
if it fits the one-line height; otherwise standard white list-row.

Delete the old "Rewards" and "From places you go" vertical sections (their
content is now hero + rails; full lists live on `/campaigns` and `/campaign-wallet`).

## Cross-cutting rules

- All new copy through `@jaqyn/i18n` (`packages/i18n/src/locales.ts`), ru + en.
  Suggested keys under `home.*`: `home.wallet`, `home.discover`, `home.expiringSoon`,
  `home.nextReward`, `home.stepsLeft` (pluralized via existing i18n plural
  mechanism if present — check how other counts are done), `home.startEarning`,
  `home.startEarningSub`, `home.scanFirst`, `home.all`.
- Tokens/classes from the Tailwind preset only; no raw hex/px. Radii, shadows,
  type per docs/design-system.md.
- Loading: while queries load, render skeleton blocks (match existing skeleton
  pattern if one exists in the app; else simple `bg-tile animate-pulse` blocks —
  `--tile` token must be added to the preset if still missing).
- Accessibility: rails are scrollable lists with labelled section headings;
  cards are links, not clickable divs.

## Tests (Vitest + RTL, same change)

- `pickHero()` unit tests: urgency beats progress; min-remaining wins; points
  cards excluded; new-user fallback when all inputs empty.
- Component test: new-user render (all queries empty) shows start-earning hero
  + discover rail, and does NOT render wallet/expiring sections.
- Adjust any existing home page tests broken by the removal of the button row.

## Verification

`pnpm turbo typecheck lint test` green from `frontend/`; live preview check of
home in three states (data-rich, expiring voucher, fresh account) via dev server.
