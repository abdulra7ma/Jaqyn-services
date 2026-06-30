---
title: Campaigns — Business (Owner) Workflow
service: shared
type: guide
status: active
last_reviewed: 2026-06-30
---
# Campaigns — Business (Owner) Workflow

How a business owner creates, runs, and measures a campaign. Campaigns are
temporary, dated challenges: a customer completes a goal (visits / a time-window
visit / a group check-in) and unlocks a reward voucher.

Backend: `apps.campaigns`. Frontend: `apps/web/app/business/campaigns/*`, wired
through `@jaqyn/api` business campaign hooks. Verified end-to-end (live API walk,
2026-06-25); see `docs/qa/campaigns-liveness-report.md` for the liveness sweep.

## Prerequisite

The business must be **approved and published** (onboarding complete → admin
verify+publish). A draft/unpublished business can author campaigns but customers
won't discover them.

## Campaign types

| Type | `campaign_type` | Rule (`rule_type`) | Goal |
|------|-----------------|--------------------|------|
| Visit | `visit` | `visit_count` | N qualifying visits |
| Time window | `time_window` | `time_window` | N visits within an active day/time window |
| Group | `group` | `group_checkin` | A group of M checks in together |

## The flow

1. **Create** — `business/campaigns/new` wizard collects name, type, schedule,
   rule, and reward, then `POST /api/business/campaigns/`. The wizard maps to the
   nested `CampaignWriteSerializer` shape via `toCampaignWritePayload`:
   - **Schedule** (campaign-level): `start_at`, `end_at` (ISO), `active_days`
     (int list, 0=Mon…6=Sun), `active_start_time`/`active_end_time` (HH:MM).
   - **Rule** (nested): `required_count`, `max_count_per_day`,
     `minimum_time_between_actions` (ISO-8601 duration, e.g. `PT4H`),
     `window_before_time`, `required_group_size`, `group_checkin_window_minutes`.
   - **Reward** (nested): `reward_type`, `title`, `description`,
     `expiry_days_after_unlock`, `max_redemptions`, `reward_receiver_type`
     (`leader` | `every_member` | `table`).
   - `repeat_policy` (`once` | `repeatable`) → `completion_limit_per_customer`.
2. **Publish / lifecycle** — `business/campaigns/[id]` exposes status-aware
   controls: **publish** (draft/scheduled), **pause** (active), **resume**
   (paused), **end** (active/paused/scheduled), **cancel** (draft/scheduled),
   **duplicate**. Each is `POST …/{id}/<action>/`.
3. **Participants** — Participants tab → `GET …/{id}/participants/`: customer,
   progress count, last-visit label, reward label, joined-at.
4. **Vouchers** — Vouchers tab → `GET …/{id}/vouchers/`: code, customer, status,
   issued/redeemed timestamps, redeemed-by staff name. The owner (or staff) can
   **cancel** an active voucher → `POST …/vouchers/{voucher_id}/cancel/`.
5. **Analytics** — Overview tab → `GET …/{id}/analytics/`: views, joined, active,
   completed, issued, redeemed, redemption rate, estimated cost.
6. **Social Post Studio** — `GET …/{id}/social-post/` (server-composed caption set)
   + image upload `POST …/{id}/image/`.
7. **At the till** — staff scan the customer's personal QR; a unified visit scan
   advances both the loyalty card and the prioritized eligible campaign (see the
   customer-workflow doc + staff scan screen). Campaign completion mints the
   reward voucher.

## Endpoints (mounted at `/api/business/campaigns/`)

| Method · Path | Purpose |
|---|---|
| `GET /` | List campaigns + `data.summary` KPI block (active/participants/issued/redeemed) + per-row counts |
| `POST /` | Create a campaign (+ nested rule/reward) |
| `GET /{id}/` · `PUT /{id}/` | Detail · update |
| `POST /{id}/publish\|pause\|resume\|end\|cancel\|duplicate/` | Lifecycle |
| `GET /{id}/participants/` · `GET /{id}/vouchers/` | Lists |
| `GET /{id}/analytics/` | Metrics |
| `GET /{id}/social-post/` · `POST /{id}/image/` | Social studio · image |
| `POST /vouchers/{voucher_id}/cancel/` | Cancel a voucher (owner or staff) |

## Known gaps / not-yet-wired (tracked)

- **Group-campaign completion is not reachable end-to-end** (Phase-2 "Q4" seam):
  no per-session check-in QR token is emitted, so `ConfirmGroupView` can't be
  reached from the UI. Visit and time-window campaigns are fully functional.
- **Edit-campaign UI**: the backend `PUT` + `useUpdateCampaign` hook exist, but no
  edit screen is wired yet (create + duplicate are the authoring paths today).
- **`staff_approval_required` toggle**: the wizard still shows it, but there is no
  backend field — it is a no-op and should be removed or implemented.
- **`/api/admin/campaigns/`** is a live route prefix with empty urlpatterns
  (intentional placeholder for the admin campaign tooling, plan §4/D8).
- Reserved (defined, not yet used): member statuses `LEFT`/`NO_SHOW`, group
  `CHECKING_IN`, action `REFERRAL`, verification methods `STAFF_MANUAL`/`AUTO_JOIN`.
