---
title: Customer home redesign — Momentum (1a) + Around You Now (1b)
service: frontend
type: spec
status: active
last_reviewed: 2026-07-03
---

# Customer home redesign v2 — mockup implementation

Implements the approved design mockup (`~/Downloads/Jaqyn Home Redesign.dc.html`):
screen **1a "Momentum"** for returning customers, **1b "Around You Now"** for new
customers. Supersedes the v1 hero+rails layout (kept: pickHero ranking logic as
the basis for card ranking, i18n keys where reusable, tile token).

Variant switch: customer is **returning** when they have ≥1 joined loyalty card,
followed campaign, or active voucher; otherwise **new** → 1b.

Visual spec (both screens): tokens/type/radii/shadows per the mockup's SPEC
section — identical to docs/design-system.md. Icons: 24×24 line SVGs,
stroke-width 1.9, round caps, currentColor. Screen h-padding 20px, section gap
22–24px, content bottom padding clears the floating nav. All copy via
@jaqyn/i18n (ru+en).

## Backend additions (all missing today)

### B1. Visit streak — `GET /api/customer/loyalty/streak/`
New endpoint in `apps.loyalty` (customer_urls). Returns `{"days": <int>}`.
Definition: number of consecutive local-calendar days (settings TIME_ZONE) with
≥1 earn event, counting back from today — or from yesterday if today has none
yet (an alive streak isn't broken until a full day is missed). Earn events =
`LoyaltyTransaction(kind=EARN)` + `CampaignAction` rows for the customer.
Service function in `apps/loyalty/services/` (typed, docstring, unit tests:
empty → 0, today only → 1, today+yesterday → 2, gap breaks, today-missing but
yesterday active → streak alive). View: thin, IsCustomer permission, throttled
like other loyalty reads.

### B2. Coordinates on loyalty cards
Add `business_latitude`, `business_longitude`, `business_address` to
`LoyaltyCardSerializer` (from the related Business). Frontend computes distance
client-side (haversine) with browser geolocation. Serializer test updated.

### B3. Nearby total count
`/api/businesses/nearby/` response gains `"count"`: the queryset count before
`limit` is applied. Serializer/view test updated.

## Frontend — shared

- `useStreak()` hook + `LoyaltyCardView` lat/lng/address + nearby `count` in
  `@jaqyn/api` types/adapters.
- Haversine + "km/m away" formatting helper in `app/_lib/` (unit test).
- Reuse `isOpenNow()` from `app/_lib/hours` for open-now checks.
- Geolocation: reuse the `navigator.geolocation.getCurrentPosition` pattern from
  `nearby/page.tsx`; silent failure → render without distance/live pill.
- Directions CTA: external link `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`
  (works on all platforms; 2GIS deep link can come later).
- Bottom nav unchanged. No QR on the page body.

## Screen 1a — Momentum (returning)

Top → bottom, per mockup:

1. **Header**: context line (localized weekday + daypart, e.g. "Wednesday
   afternoon" — client-side from Date, i18n'd), "Hey {firstName}" (Bricolage 24),
   right: **streak pill** (white pill, 🔥 + count + "day streak", `jqFlame`-style
   pulse animation). Pill hidden when streak is 0.
2. **Closest rewards slider**: label row ("CLOSEST REWARDS" uppercase label +
   "Swipe →" hint). Horizontal deck of 296px-wide cards, 12px gap, CSS
   scroll-snap (native drag/swipe); sliding-pill pager underneath (accent pill,
   width 1/N, translateX by active index, .42s cubic-bezier(.22,1,.36,1); active
   index from scroll position). Cards ranked by `rankRewards()` (evolution of
   pickHero, returns ordered list, unit-tested):
   - **Progress card**: business-accent gradient, decorative circle + oversized
     glyph emoji at low opacity; uppercase status ("You're almost there" ≤1 left /
     "Halfway there" otherwise), count pill "5 / 6"; Bricolage 22 title
     "{n} more → {reward}"; stamp row (30px tiles: filled white ✓ / dashed
     empty; cap at 8 tiles, else progress bar); footer "Open now · 1.4 km away"
     (open-now from hours, distance only with geolocation + coords) + white
     **Directions** pill (external maps link, stops card navigation).
   - **Cashback/points card**: amber-family gradient; "Cashback ready" label +
     business pill; big Bricolage 40 balance + "som to spend"; thin white
     progress bar to next bonus when a target exists; **Use now** pill →
     `/loyalty/{program_id}`.
   - Card body tap → `/loyalty/{program_id}` (or campaign detail for campaign
     candidates). Max 5 cards.
3. **Explore hub**: "Explore Jaqyn" heading + 4 equal white tiles (accent line
   icons per mockup paths): Map → `/nearby`, Group deals → `/campaigns` with
   group filter preselected (add query-param read to campaigns page if absent),
   Campaigns → `/campaigns`, Wallet → `/loyalty`.
4. **Wallet strip**: white list-row → `/loyalty`. Overlapping 36px glyph tiles
   (−12px, 2px white ring; business logo or glyph emoji; "+N" overflow tile);
   "Your wallet" + "{n} cards · {m} ready to use" (m = active vouchers across
   campaign + loyalty wallets, sage bold when m>0).
5. **Keep collecting**: heading + "See all →" (`/loyalty`). Rows for joined
   cards not shown in the slider: 40px glyph tile, name + "3 / 6" or cashback
   balance ("180 som" sage + "Cashback ready to spend"), 6px progress bar for
   stamp/visit cards. Row → `/loyalty/{program_id}`.

## Screen 1b — Around You Now (new customer)

1. **Location header**: pin icon + "Bishkek" (+ `· {area}` only if a granted
   geolocation resolves to a known business area — otherwise just city);
   Bricolage 24 title "You're near {count} rewards" (nearby `count`; while
   loading or 0 → "Rewards all around you" fallback copy).
2. **Map peek hero**: decorative stylized map (NOT a map lib): layered
   gradients + grid lines + rotated block shapes + 3 accent teardrop pins +
   sage "you" dot with `jqPing` ring; bottom gradient scrim with full-width
   white **Explore the map** button → `/nearby`.
3. **3-step chips**: Discover ▸ Scan QR ▸ Collect — step 1 full opacity with
   accent number disc, steps 2–3 at .55 opacity with tile discs.
4. **Open now near you**: heading + sage **Live** pill (dot + label; only when
   geolocation granted). List of nearby businesses (limit ~5): 46px glyph tile,
   name, "{category} · {distance} · Open/Closed" subtitle (distance omitted
   without location), accent offer line from nearby `reward` summary (fallback:
   first group offer name). Row → `/nearby/{id}`. Empty state: dashed card →
   `/nearby` (existing pattern).

## Tests

- Backend: streak service unit tests (5 cases above) + endpoint auth/permission
  /happy tests; serializer tests for B2/B3.
- Frontend: `rankRewards()` unit tests (ordering, cashback candidates, cap);
  haversine/format test; RTL: returning render (slider + hub + wallet strip +
  keep-collecting), new render (steps + open-now list, no streak pill), streak
  pill hidden at 0.
- All existing suites stay green: `pnpm turbo typecheck lint test` (frontend),
  `pytest` (backend).

## Verification

Live preview: returning customer (seeded "Roni") shows 1a with real progress
cards; fresh customer shows 1b; geolocation-denied path renders without
distances. Mobile 375px + desktop shell.
