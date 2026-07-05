# FIX-04 — Business dashboard "today's activity" is a hardcoded placeholder

Priority: CRITICAL (first-impression) · Area: business FE (+ maybe BE) · Model: **opus** (crosses API + UI; decide wire-vs-hide)

## Files
- `frontend/apps/web/app/business/dashboard/page.tsx` (~line 72–75: hardcoded "No activity yet")
- Backend candidates: `GET /api/business/dashboard/` (apps.business — check if it already returns activity), or reuse the pattern of `GET /api/staff/recent-activity/` scoped to the business.

## Current behavior
Dashboard renders an activity section that is always the empty state —
no fetch behind it. A new owner who just got scans still sees "No activity
yet": product looks dead on day 1.

## Expected behavior
Either (a) the section lists today's real events (scans/redemptions with
customer label + time), or (b) the section is removed for launch so nothing
on the dashboard lies. Prefer (a) if the dashboard endpoint can cheaply
include recent events; otherwise ship (b) — an honest dashboard beats a
fake widget.

## Fix
1. Check what `GET /api/business/dashboard/` returns. If it (or an existing
   activity service in apps.staff.services.activity) can supply today's
   events for the business, add them to the dashboard payload (backend rules
   apply: service layer, serializer, select_related, test) and render.
2. If not feasible in <½ day: delete the placeholder section from the page.
3. Empty state stays for genuinely-zero-activity businesses.

## Verify
- (a) path: seed a scan via staff flow → dashboard shows the event; backend
  test asserts payload; `pytest` + `pnpm --filter web typecheck` pass.
- (b) path: dashboard renders without the section; no dangling i18n keys.
