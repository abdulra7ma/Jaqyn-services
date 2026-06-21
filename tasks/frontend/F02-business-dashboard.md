# F02 — Business Owner Dashboard

Phase: 1–5 · Scope: later · Depends on: F00, B02–B09

## Goal
Web dashboard for owners/managers to register, configure rewards/offers, get QR,
and view activity.

## Screens (TBD §8.1) → endpoints
1. Login/Register → auth (owner may use email+password later; OTP for MVP)
2. Business Registration Form → `POST /api/business/register/`
3. Pending Approval Screen → poll `GET /api/business/me/` (status)
4. Business Dashboard → `GET /api/business/dashboard/`
5. Business Profile Settings → `PATCH /api/business/me/`
6. Create Loyalty Program → `POST /api/business/rewards/`
7. Loyalty Program Details → `GET/PATCH /api/business/rewards/{id}/` (+pause/activate)
8. Merchant QR Code Page → `GET /api/business/qr/` (download PNG)
9. Create Group Offer → `POST /api/business/group-offers/`
10. Group Offer Details/Edit → `PATCH .../{id}/` (+submit/pause/activate)
11. Active Groups → `GET /api/staff/groups/` (business view)
12. Customer List → `GET /api/business/customers/` (masked)
13. Customer Detail
14. Reports → `GET /api/business/reports/`
15. Staff Accounts/PIN → manage StaffMember + regenerate approval code
16. Business Settings

## Acceptance (Sprint 1 merchant test)
register → approved → create reward → download QR → see scan count. Plus offers,
groups, reports, staff PIN management.

## Definition of Done
Approved-gating on offer/reward creation · masked customer data · loading/empty/
error states · localized.

## Implemented
Pages under `/business` (its own routed area + bottom nav), wired live via the
isolated `frontend/packages/api/src/business/` layer (typed client + hooks):
login (phone OTP), register, dashboard (metrics state-machine: pending/rejected/
disabled/approved), rewards (list + create + pause/activate), group offers (list +
create + submit/pause/activate), merchant QR (PNG download), customers (masked),
reports, settings + staff approval-code regenerate. **Owner auth = phone OTP**
(same `request-otp`/`verify-otp`; `POST /api/business/register/` promotes the user
to `business_owner`). Approve-gating enforced backend-side; UI surfaces the error.

### Gaps (not blocking)
- No StaffMember CRUD endpoint → staff PIN *accounts* are created in Django Admin;
  the dashboard only regenerates the daily approval code.
- "Active groups (business view)" endpoint is `IsStaff`-only; owners can't call it,
  so active/completed group counts are surfaced from dashboard metrics instead.
- Business group-offer detail is PATCH-only (no GET single) → edit-in-place page
  not built; create + list + lifecycle actions cover the flow.

## Checkpoint update
F02 = DONE, note owner auth method used.
