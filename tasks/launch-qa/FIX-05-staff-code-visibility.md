# FIX-05 — Staff approval code invisible until regenerated

Priority: HIGH · Area: business FE (+ maybe BE) · Model: **sonnet**

## Files
- `frontend/apps/web/app/business/more/page.tsx` (~line 27–28: code shown only after `useRegenerateApprovalCode()` fires)
- Backend: check whether a GET for the current approval code exists (apps.business / apps.qr). `POST /api/staff/today-code/` exists for staff side.

## Current behavior
/business/more has a "Staff code" block. The current code is never fetched;
owner sees nothing until they press regenerate — which silently invalidates
the code their staff may already be using.

## Expected behavior
Owner sees the CURRENT code on load, with regenerate as an explicit
secondary action ("Regenerate — old code stops working" confirmation copy).

## Fix
1. If a GET current-code endpoint exists, wire a `useStaffCode()` hook and
   render code on mount. If not, add one (view → service, IsOwner-scoped,
   test) — small read endpoint.
2. Keep regen button; add confirm step + i18n copy (EN + RU).

## Verify
1. Open /business/more as owner → current code visible without clicking.
2. Regenerate → new code shown; staff login with old code fails, new works.
3. Backend test for the GET endpoint (auth + permission + happy path).
