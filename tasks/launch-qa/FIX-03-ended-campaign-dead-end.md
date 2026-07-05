# FIX-03 — Ended/cancelled campaign detail is a dead end

Priority: CRITICAL · Area: customer frontend · Model: **sonnet**

## Files
- `frontend/apps/web/app/campaigns/[id]/page.tsx` (CtaBar, ~line 54: returns null for ended/cancelled)

## Current behavior
Customer opens a campaign whose status is ended/cancelled (e.g. from an old
link, the earned shelf, or it ended while they were collecting): CtaBar
renders `null` → page shows campaign details with zero actions and no
explanation of why. Confusing dead end.

## Expected behavior
Ended/cancelled campaign shows a clear status notice ("This campaign has
ended" — via @jaqyn/i18n, RU included) plus a way forward: link back to
/campaigns and, if the customer earned a voucher from it, a link to
/rewards.

## Fix
In CtaBar (or above it), render a status banner + CTA for non-active,
non-completed statuses instead of null. Copy through @jaqyn/i18n (EN + RU
keys). Adjust/add a component test for the ended state.

## Verify
1. Unit test: campaign detail with status "ended" renders the notice +
   /campaigns link (and /rewards link when a voucher exists).
2. Live: set a campaign to cancelled in Django admin → open its customer
   detail page → banner + working links, no blank CTA area.
3. Active + completed campaign states unchanged.
