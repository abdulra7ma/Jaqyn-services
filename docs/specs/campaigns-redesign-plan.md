---
title: Campaigns tab redesign + Patches (from "Jaqyn Campaigns Final" design)
service: cross-cutting
type: spec
status: active
last_reviewed: 2026-07-03
---

# Campaigns redesign — plan

Source design: `Jaqyn Campaigns Final (standalone).html` (Claude Design export).
Distilled reference for implementers (scratchpad, session-local):
`mockup-spec.md`, `template.html` (pixel reference), `dcscript-1.js` (patchSVG port
source), `backend-inventory.md`. Palette/type per `docs/design-system.md`.

## Scope

1. **Campaigns tab** (`/campaigns`) becomes the customer's unified earning surface
   (loyalty cards + campaigns merged): streak header, claimable banner, vessel hero
   (closest reward), stats strip, patches row, in-progress list, earned shelf,
   discover teasers. Three states: returning / early / empty (starter mission).
2. **Discover** (`/campaigns/discover`): search + category chips + featured /
   trending / fresh sections.
3. **Hero variants**: one vessel-hero component flexing to visits/stamps, group
   seats, spend goal, points/cashback.
4. **Win moment**: full-screen confetti overlay when a scan completes a card
   (detected client-side via polling diff, same pattern as voucher polling).
5. **Patches** (`/campaigns/patches`): new account-level achievements feature —
   board, detail sheets, earn moment, 9:16 share card. New backend app.
6. **Notification loop** (backend): one-away, expiry-48h, group-fill events →
   in-app `CampaignNotice` + existing Notifier channels; copy ≤ 90 chars.

Out of scope: real push (FCM/APNs), district-geo patch rules (defs seeded but
progress stays 0), story-image server rendering.

## User workflows (must hold end-to-end)

W1 Returning: open tab → hero shows closest reward ("1 more coffee → your cup is
   free") → "Show your QR" → staff scans (existing flow) → tab refetch shows cup
   full → win overlay (confetti) → "View in wallet" → voucher screen → present →
   staff redeems. Claimable banner appears whenever an ACTIVE voucher exists.
W2 Early user: same tab, stats strip hidden (rewards_earned == 0), streak "1 wk".
W3 New user: empty state → starter mission lists 3 nearby joinable cards →
   pick one → join (existing POST) → "Show your QR" CTA.
W4 Group: in-progress row shows "2/4 joined" + Invite → existing group session
   invite flow; seat fills → group-fill notice for members.
W5 Patches: tab row (7 of 24, NEW pill) → board → tap earned patch → sheet →
   Share → share card. Locked patch → progress + "See campaigns". Server flips
   earned → next tab/board visit shows earn moment (unseen earned patch), then
   POST seen. NEW pill dismisses after first board visit.
W6 Discover: search/filter → campaign detail (existing) → join / start group.

## Backend contract (additions — everything else already exists, see inventory)

### A. `apps/patches` (new Django app)

Models:
- `PatchDef`: `slug` (pk-ish unique), `name`, `shape` (circle|shield|hexagon|banner),
  `icon` (str key), `color`/`light`/`deep` (hex), `how` (text), `rule_type`,
  `rule_params` (JSON), `sort_order`, `is_active`. Seeded by data migration from
  the 15 defs in the design (`dcscript-1.js DEF[]`).
- `UserPatch`: `user` FK, `patch` FK, `progress_current` int, `progress_target`
  int, `earned_at` null, `seen_at` null (earn-moment shown), unique(user, patch).
- `PatchBoardVisit`: `user` OneToOne, `first_visited_at` (NEW-pill dismiss).

Rule engine (`services/`): `PatchProgressService.handle_event(user_id, event, meta)`
— evaluated in a Celery task queued via `transaction.on_commit` from existing
services (no logic changes there beyond the hook call):
- loyalty stamp/visit/points recorded → events `stamp_scanned` (meta: business_id,
  category, at), `spend_recorded` (bill_amount)
- loyalty/campaign voucher issued → `card_completed` (business category)
- group confirmed with leader == user → `group_led`
- voucher redeemed → `reward_redeemed`

Rule types (cover the 15 defs): `FIRST_EVENT(event)`, `DISTINCT_BUSINESSES(n,
category?)`, `CARDS_COMPLETED(n, category?)`, `TIME_OF_DAY(before|after, HH:MM)`,
`GROUP_LED(n)`, `WEEKEND_STREAK(n)`, `SPEND_TOTAL(som)`, `REFERRALS(n)`,
`DISTRICTS(n)` (progress stays 0 in v1). Idempotent; `select_for_update` on
UserPatch row; crossing threshold sets `earned_at` and fires notifier event
`patch_earned`.

Endpoints (`/api/customer/patches/`):
- `GET  /` → `{ "earned_count": 7, "total": 15, "board_seen": false,
  "next": {"slug","name","shape","icon","color","light","deep","current",
  "target","remaining_label"} | null,
  "unseen_earned": [PatchOut] ,
  "patches": [PatchOut] }` where PatchOut =
  `{slug,name,shape,icon,color,light,deep,how,earned,earned_at,
  progress_current,progress_target}`
- `POST /seen/` `{ "slugs": [...] }` → marks `seen_at` (earn moment shown)
- `POST /board-seen/` `{}` → creates PatchBoardVisit (dismiss NEW pill)
All IsCustomer, list paginated defaults fine (≤ 24 rows), writes throttled.

### B. Existing endpoints — extensions

- `GET /api/customer/home-summary/`: add `visit_streak_weeks` (consecutive
  ISO-weeks with ≥1 visit, computed in `LoyaltyHomeService` next to days).
- `GET /api/customer/campaigns/feed/`: add `?q=` (icontains on campaign name +
  business name) and `?category=` (business category slug); add third key
  `"sections": {"featured": [...], "trending": [...], "fresh": [...]}` —
  featured = most participants joined in last 7 days (top 1–3), trending = next
  by same metric, fresh = published within 14 days. Same Campaign serializer.
- `LoyaltyCardSerializer` + campaign discover rows: add `business_lat`,
  `business_lng` (Business.latitude/longitude) so the client (which owns
  geolocation permission) computes "120 m" labels; and hero needs
  `business_area`/`business_hours` (already present on cards).
- `VOUCHER_EXPIRY_WARNING_HOURS`: 24 → 48 (design: "48h before a voucher
  lapses"), applies to campaign + loyalty warn tasks.

### C. Notification triggers (Notifier + CampaignNotice, copy ≤ 90 chars, ru/en/ky)

- `one_away`: after any progress write (loyalty stamps/visits, campaign
  progress), if `target - current == 1` → notice deep-linking the program/
  campaign. Idempotent per cycle (flag in metadata or `last_progress_at` guard).
- `voucher_expiring`: exists — window widened to 48h (B).
- `group_seat_filled`: in `join_group_session` → notify leader + existing
  members "{name} joined — {n} seat(s) left", deep link group screen.
CampaignNotice today is campaign-FK'd; add nullable `kind` + `target_url` (or a
generic notice model extension) so loyalty/one-away/group notices fit. Keep
migration additive (nullable, separate schema/data files if backfill needed).

## Frontend build

Routes (app router, all `'use client'` leaves only where interactive):
- `/campaigns` — rebuilt tab (3 states). Composes React Query data:
  `home-summary`, `cards`, `campaignFeed`, `campaignWallet`, `myGroups`,
  `patches` (new hook). Closest-reward pick: extend `_lib/pickHero.ts`-style
  pure fn `pickCampaignsHero()` (unit-tested) over cards + campaigns.
- `/campaigns/discover` — search (debounced, `q` param), chips (All ☕ 🍽 💈 👥),
  sections featured/trending/fresh from extended feed endpoint.
- `/campaigns/patches` — board (kraft canvas, 3-col grid), earned/locked bottom
  sheets (`@jaqyn/ui` Sheet), earn-moment overlay (auto-shows for
  `unseen_earned`, then POST seen), share card (9:16 overlay; Save image via
  dynamic-imported `html-to-image`; Share via Web Share API when available).
- `PatchBadge` component: 1:1 port of `patchSVG()` (shapes/gradient/stitch/locked)
  from `dcscript-1.js`.

New/changed in `@jaqyn/api`: `qk.patches`, `usePatches()`, `useMarkPatchesSeen()`,
`useMarkPatchBoardSeen()`, feed hook gains `{q, category}` + `sections`,
home-summary type gains `visit_streak_weeks`, card type gains lat/lng. Zod-parse
at the boundary per frontend rules.

Animations — extend `tailwind-preset.js` keyframes (tokens, not inline):
`jq-flame`, `jq-ask`, `jq-ask-d`, `jq-card-up`, `jq-confetti`, `jq-patch-in`,
`jq-pop`, `jq-rise` with exact curves from the design (see mockup-spec.md);
vessel fill = `transition-[height] duration-[800ms]` cubic-bezier(.22,1,.36,1).
Confetti = pure CSS component (30–34 absolutely-positioned pieces, deterministic
per-index math as in the design — no library). All gated by
`useReducedMotion()`.

i18n: new namespaces `cmp.home.*`, `cmp.discover.*`, `patch.*` in ru/en/ky.
Patch names/how strings come from backend defs? No — defs store slugs; display
strings live in `@jaqyn/i18n` keyed by slug (`patch.def.first.name`, `.how`) so
locale switching works; backend `name`/`how` remain canonical English fallback.

Design deltas to tokens: kraft `board` bg exists; add `plum`/`indigo` flat tokens
if missing (wallet gradients exist); patch palette hexes come from API rows (data,
not theme — inline style from data is acceptable like `card_accent`).

## Delivery order (sonnet implementers, sequential)

1. **B1 backend**: patches app + seeds + rule engine + endpoints; home-summary
   weeks; feed q/category/sections; lat/lng exposure; 48h warn; notification
   triggers. Tests: auth/permission/happy per endpoint, rule-engine unit tests,
   `django_assert_num_queries` on patches list + feed.
2. **F1 frontend**: API package types/hooks (both features) + campaigns tab
   rebuild + hero variants + win moment + discover. Vitest for
   `pickCampaignsHero` + component behavior; keyframes into preset (+ design-
   system doc sync).
3. **F2 frontend**: patches screens + PatchBadge + earn/share overlays.
4. **Verify**: typecheck/lint/tests; live preview walk of W1–W6; update
   docs (frontend/docs, backend/docs) + this spec → status: shipped on merge.

Branch: `feat/campaigns-redesign` off main. Conventional commits per area.
