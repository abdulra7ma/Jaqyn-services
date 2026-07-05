# FIX-01 — Starter mission "Show QR" links to 404

Priority: CRITICAL · Area: customer frontend · Model: **haiku** (one-line edit + test)

## Files
- `frontend/apps/web/app/campaigns/page.tsx` (line ~486)
- `frontend/apps/web/app/campaigns/page.test.tsx`

## Current behavior
New customer (0 cards/campaigns) sees the starter mission on /campaigns,
joins one of the 3 suggested campaigns, then the success card's "Show QR"
link points to `href="/visit-qr"` — route does not exist → 404. The correct
route `/campaigns/visit-qr` is already used elsewhere in the same file
(line ~280).

## Expected behavior
Link navigates to `/campaigns/visit-qr` (personal QR + eligible campaigns).

## Fix
Change `href="/visit-qr"` → `href="/campaigns/visit-qr"`. Add/extend a test
in page.test.tsx asserting the joined-state starter mission renders a link
to `/campaigns/visit-qr`.

## Verify
1. `pnpm --filter web test -- campaigns` passes.
2. Live: fresh customer account → /campaigns → join starter campaign →
   click "Show QR" → lands on /campaigns/visit-qr (no 404).
