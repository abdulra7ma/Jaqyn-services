# FIX-06 — Staff activity filters missing points/social kinds

Priority: HIGH · Area: staff frontend · Model: **haiku**

## Files
- `frontend/apps/web/app/staff/activity/page.tsx` (~line 44: `FILTER_CHIPS = ["all","redeem","stamp","visit"]`)
- i18n keys for the two new chips (`@jaqyn/i18n`, EN + RU)

## Current behavior
Backend `GET /api/staff/recent-activity/?kind=` supports kinds
redeem/stamp/visit/points/social; the UI only offers chips for the first
three. Points and social events appear under "all" but can't be filtered —
points businesses (cafés on spend-based points) get a useless filter row.

## Expected behavior
Chips: all · redeem · stamp · visit · points · social. Each filters the
feed via the existing `kind` query param.

## Fix
Add "points" and "social" to FILTER_CHIPS + labels via @jaqyn/i18n. Extend
the page test if one exists.

## Verify
1. Seed one points event + one social confirm; open /staff/activity;
   each new chip shows only its kind.
2. `pnpm --filter web typecheck` passes; no hardcoded chip labels.
