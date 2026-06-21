# B08 — Staff App Endpoints (consolidation)

Phase: 2–4 · Scope: spans sprints · Depends on: B03, B05, B07

## Goal
Round out the staff surface (much built in B03/B05/B07). Staff app must be dead simple.

## Endpoints
- `POST /api/staff/login/` (B03)
- `GET  /api/staff/today-code/` (B03)
- `POST /api/staff/scan/` → resolve any token, route to collect-verify/redeem/group.
- `POST /api/staff/redeem/` + `redeem/manual-code/` (B05)
- `GET  /api/staff/recent-activity/` → recent ScanLog/redemptions @ business.
- `GET  /api/staff/groups/` + `groups/{id}/verify/` + `groups/{id}/redeem/` (B07)

## Logic
All staff endpoints scoped to the staff's business (from staff JWT). `manager`
may see limited analytics; `cashier` cannot. recent-activity = last N actions.

## Acceptance
- staff sees today code · scans/redeems within own business only · cross-business
  blocked (`WRONG_BUSINESS`) · recent activity lists last actions.

## Definition of Done
Business-scoped querysets · role split cashier/manager · tests · envelope.

## Checkpoint update
B08 = DONE, note staff JWT claims + scoping approach.
