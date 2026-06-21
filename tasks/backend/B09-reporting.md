# B09 — Reporting & Analytics (Phase 5)

Phase: 5 · Scope: later · Depends on: B04, B05, B07

## Goal
Business + admin metrics; event tracking; weekly report task.

## Endpoints
- `GET /api/business/dashboard/` + `GET /api/business/reports/` 🏪
- `GET /api/business/customers/` 🏪 (masked, business-scoped)
- Admin platform metrics (Django Admin views / REST).

## Business metrics (TBD §5.12)
total scans · new vs returning customers · rewards issued/redeemed · active +
completed groups · group completion rate · customers from group deals ·
estimated revenue (manual assumption fields).

## Admin metrics
total/active businesses · total customers · total scans · total redemptions ·
suspicious scans · active offers · completed groups.

## Logic
- Aggregate from ScanLog, RewardTransaction, RewardRedemption, GroupDeal/Member.
- Return-customer = customers with ≥2 distinct-day scans.
- Analytics events table or structured log (events list in CONVENTIONS.md).
- Beat `send_business_weekly_report(business_id)` weekly.

## Acceptance (TBD Phase 5)
Business sees all listed metrics; numbers reconcile with raw rows in admin.

## Definition of Done
Queries indexed/efficient · masked customer data · tests on metric math.

## Checkpoint update
B09 = DONE, note revenue assumption + return-rate definition.
