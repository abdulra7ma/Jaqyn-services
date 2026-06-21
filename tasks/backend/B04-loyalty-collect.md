# B04 — Loyalty Program + Collect Loop (Core Loop 1)

Phase: 2 · Scope: Sprint 1 · Depends on: B03

## Goal
Business creates reward program; customer scans QR + enters staff code → progress
increments; unlocks at target. The Sprint 1 acceptance loop.

## Models
RewardProgram · CustomerRewardProgress · RewardTransaction (+ RewardRedemption
created at unlock; staff redeem in B05).

## Endpoints
- `POST/GET /api/business/rewards/` · `GET/PATCH /api/business/rewards/{id}/`
  · `pause` · `activate`  (🏪, business approved only). Emit `reward_program_created`.
- `GET /api/customer/rewards/` · `GET /api/customer/rewards/{id}/`  (👤)
- `POST /api/qr/{token}/collect/` 👤 body {approval_code}  ← core action.

## Collect logic  (TBD §11.1)
1. Resolve token → must be `merchant_collect`, business `approved` → else
   `BUSINESS_NOT_ACTIVE` / `INVALID_QR_TOKEN`.
2. Require authenticated customer (else 401 → frontend routes to login).
3. Pick active RewardProgram (or program in payload). Inactive → `BUSINESS_NOT_ACTIVE`.
4. Validate approval_code (business + window + active) → `INVALID_APPROVAL_CODE`.
5. Fraud checks: per-day collection limit + min interval → `SCAN_LIMIT_REACHED`.
6. get_or_create CustomerRewardProgress (snapshot target_count); `current_count += 1`.
7. Create RewardTransaction(action=`earned`, source=`qr_scan`).
8. If `current_count >= target_count` → status `unlocked`, set `unlocked_at`,
   add RewardTransaction(action=`unlocked`), create RewardRedemption(status=pending,
   code+token, expires_at = now + expiry_days) → enqueue `send_reward_unlocked`.
9. Always write ScanLog (success/failed/blocked). Return updated progress.
Emit `merchant_qr_scanned`, `reward_collected`, `reward_unlocked` as applicable.

## Acceptance (TBD §11.1, §21.2, Sprint 1)
- create stamp reward · customer collects with valid code · wrong code fails ·
  repeat beyond limit fails · progress visible · unlocks exactly at target ·
  ScanLog per attempt · merchant dashboard scan count reflects it.

## Definition of Done
Atomic increment (select_for_update) · idempotent under double-submit ·
transactions ledger correct · tests for each acceptance bullet · admin inspectable.

## Checkpoint update
B04 = DONE. **Sprint 1 acceptance test passes** — note the end-to-end run.
