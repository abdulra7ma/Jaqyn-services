---
title: Loyalty Wallet Redesign — Physical Card Wallet + Nav Modernization
service: frontend
type: spec
status: active
last_reviewed: 2026-06-30
---
# Loyalty Wallet Redesign — Physical Card Wallet + Nav Modernization

> Spec · 2026-06-29 · branch `feat/loyalty-business-design`
> Source of truth for the redesign: `Downloads/Jaqyn Wallet (standalone).html`
> (interaction + visual spec) plus the design system (`docs/design-system.md`).

## 1. Goal

Replace the customer loyalty wallet (`apps/web/app/loyalty/page.tsx`) — today a
flat vertical list of business groups — with a **physical card wallet**: one
card per shop, stacked last-used-on-top, drag to open / dismiss / reorder, plus a
swipeable "Slides" carousel mode. Modernize the existing bottom nav pill in the
same change.

**In scope:** the `/loyalty` screen and `BottomNav`. Frontend only — no backend
or API change.

**Out of scope:** campaign-voucher wallet (`/campaign-wallet`, `/campaigns`),
the home screen, any backend/serializer change, new loyalty data fields.

## 2. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Wallet scope | Loyalty programs only | Campaign vouchers stay in their own wallet; no merged data layer needed. |
| Gesture/spring engine | `framer-motion`, dynamic-imported | Best-feel drag/stack/carousel springs; lazy-loaded out of the initial bundle (same rule as the QR scanner). |
| Detail sheet | Reuse `vaul` (already installed) | No second sheet implementation. |
| Card accent color | Derived from `business_id` hash | No backend color field; stable per shop. |
| Nav | Modernize existing 5-slot pill | No route/IA change. |

## 3. Data — no backend change

Source stays `useLoyaltyCards()` → `LoyaltyCardView[]`
(`packages/api/src/loyalty/types.ts`):

```ts
type LoyaltyCardView = {
  program_id: string;
  business_id: string;
  business_name: string;
  business_logo_url: string | null;
  type: "points" | "stamp" | "visit";
  name: string;
  reward_summary: string;
  joined: boolean;
  stamps_count: number;
  visits_count: number;
  required_count: number | null;
  points_balance: number;
  points_per_som: string | null;
  cashback_per_point: string | null;
  pct_back: string | null;
};
```

### Grouping

Group `LoyaltyCardView[]` by `business_id` into a derived view model — **one
`WalletShopCard` per shop**:

```ts
type WalletShopCard = {
  businessId: string;
  businessName: string;
  businessLogoUrl: string | null;
  programs: LoyaltyCardView[];   // 1..n
  accent: CardAccent;            // derived from businessId
  ready: boolean;                // any program claimable
};
```

A shop with >1 program shows "N programs" on the face; the detail sheet lists
each program row.

### Pure helpers (`app/loyalty/_lib/`)

All three are pure functions, unit-tested, no React:

- `programReady(p: LoyaltyCardView): boolean`
  - `stamp` / `visit`: `required_count != null && count >= required_count`
    (`count` = `stamps_count` or `visits_count`).
  - `points`: **always `false`**. Points programs are staff-only; a customer
    can never have a points reward "Ready" in the wallet (resolved O-1).
- `progViz(p: LoyaltyCardView): ProgressVisual`
  - `stamp`/`visit` → `{ kind: "dots", filled, total }`.
  - `points` → `{ kind: "number", value, suffix }` (cashback / points balance).
- `cardAccent(businessId: string): CardAccent`
  - Deterministic hash → index into a **curated warm palette** drawn from the
    design system (terracotta `--accent`, amber, sage, plus muted variants).
    Each accent = `{ from, to, glyphTint }` for the gradient face. Palette lives
    next to the helper with a comment citing the design-system tokens it pulls.

`ready` on `WalletShopCard` = `programs.some(programReady)`.

## 4. Components

New, under `apps/web/app/loyalty/_components/` (and `_lib/` for helpers). The
page (`app/loyalty/page.tsx`) becomes a thin server/client shell that fetches and
renders the wallet.

### 4.1 `WalletCard`
The physical card face. Props: `WalletShopCard`, plus presentational state
(`offsetIndex`, `isTop`). Renders per design system §8 "Featured card" language:
- `bg` = accent gradient (`from`→`to`), white text, `rounded-modal` (24px), accent glow.
- Decorative translucent watermark circle bleed; frosted business glyph/initials
  (design-system §8 avatar language).
- Shop name (Bricolage), reward summary, progress viz (`progViz`), status pill.
- Multi-program → "N programs" label.
- `ready` → pulsing 🎁 badge + glow ring (`jqPing`-style; reuse the design
  system animation, don't invent one).

Pure presentation — no data fetching, no gesture logic.

### 4.2 `CardStack`  (`'use client'`, dynamic-imported, `ssr:false`)
Stacking + drag, framer-motion. Ports the demo's `renderVals()` geometry:
- Cards stacked with downward offset + scale falloff; last-used on top.
- Drag top card up past **58px** → open `WalletDetailSheet` for that shop.
- Drag top card down past **58px** → send to back; others cascade up (staggered).
- Tap a card behind the top → it pops to top, the rest cascade into place.
- Reduced-motion: respect `prefers-reduced-motion` — snap, no spring.
- Geometry constants (offsets, scale step, stagger ms, ±58px threshold) live in a
  single `renderVals` object with comments tying each to the demo.

### 4.3 `CardCarousel`  (`'use client'`, dynamic-imported, `ssr:false`)
"Slides" mode. framer-motion drag with snap-to-card, plus prev/next arrows and a
dot indicator. Same `WalletCard` faces, laid out horizontally.

### 4.4 `StackSlidesToggle`
Segmented control (design-system §6): white tray, accent thumb. Controls which
view renders. View choice is **ephemeral UI state** (`useState`), not server
state, not persisted (YAGNI — revisit if users ask to remember it).

### 4.5 `WalletDetailSheet`  (vaul)
Bottom sheet (design-system §10, `rounded-sheet`, grab handle `bg-handle`).
Header = shop. Body = one row per program (stamps grid / cashback bar / visit
dots per design-system §9), each with its reward summary and the existing
per-program actions already present on the current loyalty screen (e.g. show QR).
**No new actions** — preserve what `BusinessLoyaltyCard` exposes today.

### 4.6 Empty / loading / error
- Empty wallet → design-system §10 empty state (dashed card, single accent CTA to
  discover shops). Preserve whatever the current page does on empty.
- `loading.tsx` / `error.tsx` for the route segment if not already present
  (frontend rule: every meaningful segment has them).

## 5. Nav modernization — `apps/web/app/_components/BottomNav.tsx`

Keep the 5 slots (Home · Loyalty · Scan(raised) · Campaigns · Profile), routes,
and the raised gradient scan button. Add:
- **Animated active indicator** — a pill/dot behind the active icon, moved with
  framer-motion `layoutId` so it glides between slots on route change.
- **Press feedback** — spring scale-down on tap (framer-motion `whileTap`).
- Tokenized colors only (active `text-brand`, inactive `text-subtle`).
- Respect `prefers-reduced-motion` (no glide → instant).
- A11y preserved: `<nav>`, labelled links, `aria-current` on the active route,
  visible focus, 44px min touch targets (design-system §4).

## 6. Library

Add `framer-motion` to `apps/web` (`package.json`, `workspace:`-clean — it's an
external dep so a pinned range). Dynamic-import the drag-heavy components
(`CardStack`, `CardCarousel`) with `ssr:false` so framer-motion stays out of the
initial server bundle. The nav uses framer-motion too but is lightweight and may
import directly (it's already a client component island).

## 7. Testing

- **Unit (Vitest)** — `programReady`, `progViz`, `cardAccent` (determinism +
  palette membership), and the group-by-`business_id` view-model builder. Pure
  functions, no DOM.
- **Component (RTL)** — `StackSlidesToggle` switches views; tapping a card opens
  `WalletDetailSheet` and it lists the right program rows. Query by role/text,
  mock the API with MSW (frontend rule), not by stubbing internals.
- **Gesture physics** are not unit-tested directly (framer-motion internals);
  the thin wrappers delegate to tested helpers, and geometry constants are
  asserted to exist/shape where it's cheap.
- Add/adjust these in the same change.

## 8. Open questions

- **O-1 — points "ready" rule.** RESOLVED: points programs are staff-only;
  customers never see a points reward as Ready. `programReady` returns `false`
  for `type === "points"`.
- **O-2 — show-QR action source.** Confirm the existing per-program action(s) on
  `BusinessLoyaltyCard` so the detail sheet reuses them verbatim. To verify
  against the current `apps/web/app/loyalty/page.tsx` + `BusinessLoyaltyCard`
  during planning.

## 9. Acceptance criteria

1. `/loyalty` renders one card per shop, stacked, last-used on top; flat list gone.
2. Drag up (>58px) opens the shop's detail sheet; drag down sends the card to
   back with the others cascading; tapping a back card pops it to top.
3. Stack/Slides toggle switches to a swipeable carousel (drag, arrows, dots).
4. A shop with a claimable reward shows the pulsing 🎁 Ready badge + glow ring;
   one with multiple programs shows "N programs" and lists them in the sheet.
5. Detail sheet lists every program with its progress + the same actions the old
   screen offered.
6. `prefers-reduced-motion` disables springs (snap instead) everywhere.
7. Bottom nav shows an animated active indicator that glides between slots and a
   press-spring; routes, scan button, and a11y unchanged.
8. framer-motion is absent from the initial bundle (drag components lazy-loaded).
9. Helper unit tests + toggle/sheet component tests pass.
