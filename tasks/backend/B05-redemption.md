# B05 — Reward Unlock & Redemption (Sprint 2)

Phase: 3 · Scope: later · Depends on: B04

## Goal
Complete reward lifecycle: redemption code/QR, staff redeem, expiry, logs.

## Models
RewardRedemption (full) · RewardTransaction (reversed/adjusted).

## Endpoints
- `POST /api/customer/rewards/{id}/generate-redemption-code/` 👤 (a.k.a.
  `redeem-request`) → ensure unlocked, (re)issue pending RewardRedemption + QR.
- `POST /api/staff/redeem/` 🧑‍💼 body {code|token}
- `POST /api/staff/redeem/manual-code/` 🧑‍💼 body {code}
- `POST /api/qr/{token}/redeem/` 🧑‍💼

## Redeem logic  (TBD §11.2)
Validate: redemption exists · belongs to staff's business (else `WRONG_BUSINESS`) ·
status `pending` (else `REWARD_ALREADY_REDEEMED`) · not expired (else `REWARD_EXPIRED`).
On redeem (atomic): RewardRedemption → `redeemed` (+redeemed_by, redeemed_at);
CustomerRewardProgress → `redeemed`; RewardTransaction log; ScanLog. Emit
`reward_redeemed`, `staff_redeemed_reward`.
Beat `expire_rewards`: pending past expires_at → `expired`.

## Acceptance (TBD §11.2, §21.3, Sprint 2)
- valid redeem · cannot redeem twice · wrong business blocked · expired blocked ·
  manual code fallback works · customer view updates after redeem.

## Definition of Done
Double-redeem race-safe (select_for_update) · logs · tests · admin shows
RewardRedemption with status + redeemed_by.

## Checkpoint update
B05 = DONE, note redemption code format + expiry default.
