# FIX-02 — Staff scan ↔ groups infinite redirect loop on desktop

Priority: CRITICAL · Area: staff frontend · Model: **sonnet**

## Files
- `frontend/apps/web/app/staff/scan/page.tsx` (~line 948–957: matchMedia ≥1024px → `router.replace("/staff/groups")`)
- `frontend/apps/web/app/staff/groups/page.tsx` (`redirect("/staff/scan")`)

## Current behavior
On viewport ≥1024px, /staff/scan replaces to /staff/groups; /staff/groups
(groups tab removed in staff-app-handoff) redirects back to /staff/scan →
infinite ping-pong. Staff app unusable on any desktop/laptop; owner-as-staff
switch from the business app (desktop) lands straight in the loop.

## Expected behavior
Desktop staff user lands on /staff/scan and can use it (scanner or manual
code entry both work on desktop), or at minimum sees a clear "scanning is
mobile-first — use your phone" panel with working Activity/Profile nav.
No redirect loop anywhere.

## Fix
Remove the desktop `router.replace("/staff/groups")` block in scan/page.tsx.
Keep /staff/groups → /staff/scan redirect (harmless bookmark fallback).
Confirm the scan page layout doesn't break at ≥1024px (StaffNav already has
a desktop sidebar without a Scan tab — if scan can't render acceptably on
desktop, render the mobile-first notice instead; copy via @jaqyn/i18n).

## Verify
1. Desktop viewport (≥1024px): open /staff/scan — page renders, no redirect,
   no console loop.
2. /staff/groups still lands on /staff/scan once.
3. Mobile viewport: scan flow unchanged (camera sheet, manual code entry).
4. `pnpm --filter web typecheck && pnpm --filter web test -- staff` pass.
