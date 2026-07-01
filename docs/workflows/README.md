---
title: Workflow Map
service: cross-cutting
type: reference
status: active
last_reviewed: 2026-06-30
---

# Workflow Map

End-to-end flows across the Jaqyn stack (Next.js `web` → Django REST → Postgres/
Redis/Celery), traced UI → API → backend → UI. The evidence base for every claim
here is [`endpoint-map.md`](endpoint-map.md) — the verified endpoint ↔ frontend
table with `file:line` citations on both sides.

Legend for depth: **◆ full** (summary · layers · steps · sequence diagram ·
entry/exit · gaps · fixes) · **◇ light** (summary · steps · one diagram).

## Workflows

| # | Workflow | Depth | Summary |
|---|---|---|---|
| 1 | [customer-auth](customer-auth.md) | ◆ | Phone-OTP / email-OTP / password sign-in + reset, `resolve_area` routing, and the post-signup onboarding tail |
| 2 | [business-registration-onboarding](business-registration-onboarding.md) | ◆ | Landing lead → admin approve → activation email → owner activate → onboarding wizard → submit for verification |
| 3 | [campaign-collect-redeem](campaign-collect-redeem.md) | ◆ | Customer discovers/joins a campaign, staff scans personal QR to advance it, customer presents voucher, staff redeems |
| 4 | [campaign-group-session](campaign-group-session.md) | ◆ | Customer starts a group session, invites members, group fills; staff confirms the group reward |
| 5 | [staff-scan-unified](staff-scan-unified.md) | ◆ | One POS scan auto-routes by QR type (customer / voucher / group) and advances loyalty + campaigns |
| 6 | [loyalty-earn-redeem](loyalty-earn-redeem.md) | ◆ | Customer joins a loyalty program, staff awards points/visits, customer redeems points → voucher → item |
| 7 | [qr-resolution](qr-resolution.md) | ◆ | First scan of a `/q/<token>` link resolves the QR server-side and renders a business card + login gate |
| 8 | [campaign-authoring](campaign-authoring.md) | ◇ | Owner creates → publishes → runs lifecycle (pause/resume/end/cancel) → tracks analytics → social post |
| 9 | [loyalty-authoring](loyalty-authoring.md) | ◇ | Owner creates and manages loyalty programs (pause/activate/archive) |
| 10 | [staff-invite-and-management](staff-invite-and-management.md) | ◇ | Owner invites staff; staff activates; owner suspends/reactivates/resets password |
| 11 | [nearby-discovery](nearby-discovery.md) | ◇ | Customer browses nearby businesses on a map/list by location + category |
| 12 | [business-reports](business-reports.md) | ◇ | Owner views dashboard KPIs, period reports, and customer roster |

References (not user-initiated end-to-end flows):

- [admin-operations](admin-operations.md) — Django-admin backend reference: verification queue, enforcement, manual adjustments (no Next frontend).
- [notifications](notifications.md) — cross-cutting, side-effect-triggered email/SMS/push reference.

---

## Missing / broken (ranked)

From the verified gap table in [`endpoint-map.md`](endpoint-map.md#verified-gap-table-the-only-actionable-findings).
No **live** user-facing flow calls a missing endpoint — the two 🔴s are dead legacy code.

1. 🔴 **Dead staff redeem methods** — `staffApi.redeem` (`staff/api.ts:51`) and
   `redeemManual` (`staff/api.ts:53`), with hooks `useStaffRedeem`/
   `useStaffRedeemManual` (`staff/hooks.ts:19,27`), POST `/api/staff/redeem/` and
   `/api/staff/redeem/manual-code/` — **no such backend route** (`staff/urls.py`
   comment says they moved to the campaigns unified scanner). No `.tsx` imports the
   hooks. **Fix:** delete both methods + both hooks. See [staff-scan-unified](staff-scan-unified.md#gaps).
2. 🟠 **Logout doesn't blacklist** — FE `logout()` (`staff/api.ts:44`) only clears
   local tokens; `POST /api/auth/logout/` (`accounts/urls.py:25`) is never called,
   so the SimpleJWT refresh token survives logout. **Fix:** call the endpoint on
   logout, or remove it. See [customer-auth](customer-auth.md#gaps).
3. 🟠 **Orphan `GET /api/staff/programs/`** — `StaffProgramsView` (`staff/urls.py:10`)
   has no FE caller. **Fix:** remove, or surface a staff "programs" view.
4. 🟠 **Orphan `POST /api/merchant/<id>/validate-code/`** — superseded by the unified
   scanner; confirm dead and remove.
5. 🟠 **Group completion gap (open question)** — `campaigns-customer-workflow.md`
   says the group check-in QR token isn't minted, so a filled group can't be
   completed from the customer UI. Verify against `campaigns/services/group.py`.
   See [campaign-group-session](campaign-group-session.md#gaps).

## Too many steps (ranked friction)

1. **business-registration-onboarding** — current path is **lead form → wait for
   admin approval → activation email → activate → multi-step wizard → submit →
   wait for verification**: 2 human-gated waits and 6+ screens before a business is
   live. See that doc's *Friction* section for where async approval could be
   collapsed or made self-serve.
2. **customer-auth (email signup)** — `/signup` picker → `/signup/email` → enter
   email → enter 6-digit code → `/signup/complete` (phone completion) →
   onboarding tour: **5 screens** before the home feed. Phone-OTP path is shorter.
3. **campaign-collect-redeem** — collect and redeem are two separate staff scans of
   the same personal QR on two different customer screens (`/collect`, `/rewards`);
   reasonable for POS but worth noting the round-trips.
