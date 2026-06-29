# Customer map redesign — map-first `nearby`

> 2026-06-29 · customer web app · design spec
> Route: `frontend/apps/web/app/nearby/page.tsx`

## Goal

Turn the customer `nearby` screen from a scroll-page (small map + list below)
into an immersive **map-first** experience: the map fills the viewport, a
collapsible search bar and a reward-count pill float on top, and the business
list lives in a drag-up bottom sheet. Matches the provided mockups.

## Principles

- **Reuse, don't rebuild.** `MiniMap`, `NearbyCard`, `FilterChips`,
  `BusinessSheet`, `isOpenNow`, and the existing page state (`search`, `cat`,
  `selected`, `sheetId`, `loc`) all carry over. New code is layout + chrome only.
- No backend changes. No new map provider. No layout toggle (sheet-only).
- Design tokens from `@docs/design-system.md` / the Tailwind preset — no inline hex.

## Layout

Full-bleed map. This route opts out of `CustomerShell`'s scroll padding; the map
is the canvas. Bottom nav floats over the map (its existing floating style).

```
┌─────────────────────────────┐
│ (🔍)            🎁 N nearby  │  ← floating top bar (collapsed)
│                             │
│           [ MAP ]           │  ← MiniMap, full-bleed
│                             │
│  ╭───────── handle ───────╮ │
│  │ Closest to you         │ │  ← Vaul bottom sheet (peek)
│  ╰────────────────────────╯ │
│   🏠  🎁  (◎ scan)  ⚑  👤   │  ← floating BottomNav
└─────────────────────────────┘
```

## Top bar — two states

**Collapsed (default):**
- Top-left: floating circle `🔍` button (`44px`, `bg-card`, `shadow-card`).
- Top-right: **`🎁 N nearby` pill** (`bg-card`, `rounded-pill`, `shadow-card`).
  - `N` = count of nearby businesses with a live `reward`.
  - Tap → snap the bottom sheet to full height to browse them.

**Expanded (tap 🔍):**
- Circle morphs into the full-width search input (existing search box, re-skinned
  as a floating pill: `bg-card`, `rounded-pill`, `shadow-card`).
- `FilterChips` (categories) row slides in below the search bar.
- Tap clear / tap map → collapse back to circle; chips hide.

State: one local `searchOpen: boolean`. `search` and `cat` state unchanged.

## Bottom sheet (Vaul)

Vaul is already a dependency (responsive sheet system). Three snap points:

| Snap | Height | Content |
|---|---|---|
| Peek | ~12% | grab handle + "Closest to you" header |
| Half | ~50% | handle + header + scrollable `NearbyCard` list |
| Full | ~90% | same, taller |

- Grab handle: `42×5`, `bg-handle` (per design system §10).
- Sheet surface: `rounded-sheet`, `shadow-sheet`, `bg-card`.
- The sheet is **non-modal** (map stays interactive behind it; no backdrop dim).

## Pin ↔ list sync

Unchanged wiring via existing props:
- Tap pin → `onSelect(id)`: highlight pin, snap sheet to Half, scroll that
  `NearbyCard` into view (`scrollIntoView`, existing `selected` border styling).
- Tap card → `onOpen(id)`: existing `BusinessSheet` detail opens above the list
  sheet (its own Vaul layer / current behavior).
- **No auto-pan.** Pins behind the peeking sheet stay where they are; the user
  can drag the map. (ponytail: skip map-pan wiring.)

## Component changes

- **`MiniMap`** — add a `fullBleed?: boolean` (or `className`/height) prop so it
  fills its container edge-to-edge instead of sitting in a fixed-height card.
  Existing pin/zoom/fit logic untouched.
- **`nearby/page.tsx`** — rewritten as the fullscreen composition: full-bleed
  `MiniMap`, floating top bar (collapsible), Vaul list sheet, `BusinessSheet`.
- **New (small):** a `MapTopBar` and a `NearbySheet` helper component, co-located
  under `app/nearby/` or `app/_components/`, to keep the page readable.

## i18n

All copy via `@jaqyn/i18n`. New/reused keys: `nearby.search`, `nearby.all`,
`nearby.closestTo`, `nearby.open`/`closed`/`nearest`/`distance`, and a new
`nearby.rewardCount` (e.g. `"{count} nearby"`). No hardcoded strings.

## Out of scope / deferred

- Layout toggle to the old scroll page (sheet-only by decision).
- Map auto-pan on pin select.
- New map provider or backend/API changes.

## Verification

- Manual (preview): collapsed bar shows 🔍 + reward pill; tapping 🔍 expands
  search + chips; tapping pill opens sheet full; dragging sheet hits 3 snaps;
  tapping a pin scrolls to + highlights its card; tapping a card opens detail.
- Reward-count correctness: pill `N` equals number of nearby businesses with a
  reward (assert in a component test against mock data).
- Existing `nearby/[id]/page.test.tsx` stays green.
