# FIX-10 — Dead code cleanup (scan legacy + unused hooks/keys)

Priority: MEDIUM (only if time remains) · Area: FE + BE · Model: **sonnet**

## Files
- Backend: `apps/staff/views.py` `StaffScanView` + its `scan/` route in
  `apps/staff/urls.py` — SHADOWED by exact-match
  `path("api/staff/scan/", UnifiedStaffScanView…)` in `config/urls.py:36`;
  never reachable.
- Frontend: unused hooks in `frontend/packages/api/src/staff/hooks.ts`
  (`useStaffScan`, `useScanCustomerForCampaigns`, `useStaffRedeem`,
  `useStaffRedeemManual` — confirm zero call sites first).
- i18n: unused `staff.groups.*` keys in `frontend/packages/i18n/src/locales.ts`
  (keep `checkedInOf`, `redeemGroup`, `memberChecked` — used by scan sheets).

## Current behavior
Legacy scan view + hooks + keys linger after the unified-scanner and
staff-app-handoff restructures. No runtime bug (routing order protects the
endpoint), but the duplicate response shapes are a trap for future edits.

## Expected behavior
One scan resolve path in code = the one that runs. No unreferenced hooks or
i18n keys on staff surfaces.

## Fix
Grep for references before each deletion; remove view+route, hooks, keys in
one `chore:` commit. Do NOT touch `/staff/groups` redirect page (harmless
bookmark fallback) or loyalty award/redeem endpoints (still live fallback
for `loyalty:*` ids).

## Verify
1. `pytest` backend suite passes; POST /api/staff/scan/ still returns the
   unified `kind` payload (existing tests).
2. `pnpm --filter web typecheck && pnpm --filter web test` pass.
3. Grep confirms zero references to removed symbols/keys.
