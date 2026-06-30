---
title: Campaigns — Customer Workflow
service: shared
type: guide
status: active
last_reviewed: 2026-06-30
---
# Campaigns — Customer Workflow

How a customer discovers a campaign, joins it, makes progress, and redeems the
reward. Mirrors the business-workflow doc from the consumer side.

Backend: `apps.campaigns` (customer + staff surfaces). Frontend:
`apps/web/app/campaigns/*`, `apps/web/app/campaign-wallet/*`, and the staff scan
screen. Verified end-to-end (live API walk, 2026-06-25).

## The flow

1. **Discover** — the Campaigns tab (linked in the customer bottom nav) lists
   active campaigns for nearby/published businesses → `GET /api/customer/campaigns/`.
   A **one-time** campaign the customer has already completed/redeemed is **hidden**
   from discovery (it has paid out and now lives in the wallet); a **repeatable**
   campaign stays visible so it can be earned again.
2. **Detail** — open a campaign → `GET /api/customer/campaigns/{id}/`: name, type,
   schedule (start/end labels + days + active hours, formatted client-side from the
   ISO/time fields), rule summary, reward, and the customer's own `my_progress`.
3. **Join** — `POST /api/customer/campaigns/{id}/join/` creates a participant row
   and re-reads the detail so progress is live. (Some campaigns auto-join.)
4. **Show the visit QR** — the customer presents their personal QR; the screen
   polls eligibility so it reflects each counted visit.
5. **Progress (at the till)** — staff scan the personal QR; the unified visit
   endpoint `POST /api/staff/campaigns/visit/` advances the prioritized eligible
   campaign (and the loyalty card) under a duplicate-visit fraud guard. Progress is
   reported as `progress_count / required_count`.
6. **Completion → voucher** — when the goal is met, the campaign reward voucher is
   minted atomically (`issue_reward_voucher`) and the participant flips to
   `completed`.
7. **Wallet** — `GET /api/customer/campaign-wallet/` lists earned vouchers;
   `GET /api/customer/campaign-vouchers/{id}/` opens one.
8. **Present & redeem** — the customer presents the voucher; staff scan it
   (`POST /api/staff/campaigns/scan-voucher/`) and redeem
   (`POST /api/staff/campaigns/redeem-voucher/`, row-locked so a voucher can be
   redeemed only once). Status flips to redeemed.

## Endpoints

| Method · Path | Purpose |
|---|---|
| `GET /api/customer/campaigns/` | Discover active campaigns |
| `GET /api/customer/campaigns/{id}/` | Detail + my_progress |
| `POST /api/customer/campaigns/{id}/join/` | Join |
| `GET /api/customer/campaign-wallet/` | Earned vouchers |
| `GET /api/customer/campaign-vouchers/{id}/` | Voucher detail |
| `POST /api/customer/campaign-vouchers/{id}/present/` | Present to staff |
| `POST /api/staff/campaigns/visit/` | Staff: unified visit (advances campaign) |
| `POST /api/staff/campaigns/scan-voucher/` · `redeem-voucher/` | Staff: scan · redeem |

## Card / voucher display notes (now correct)

The card fields the backend does not pre-format are derived client-side in
`packages/api/src/customer/adapters.ts`:
- `start_label` / `end_label` ← `start_at` / `end_at`
- `days_left` ← `end_at`
- `active_hours` ← `active_start_time` + `active_end_time`
- `repeat_policy` ← falls back to `completion_limit_per_customer`
A **cancelled** voucher now shows its own label/tone (no longer collapsed into
"expired").

## Known gaps / not-yet-wired (tracked)

- **Group campaigns**: forming/joining a group works via the invite/QR flow, but a
  full group cannot be *completed* from the UI yet — the per-session check-in QR
  token is not minted (Phase-2 "Q4" seam). The staff confirm-group result display
  has a shape mismatch that is moot until the check-in token exists.
- The standalone `POST /api/customer/campaign-groups/join/` REST endpoint is
  unused (group join goes through the invite/QR flow, not this route).
