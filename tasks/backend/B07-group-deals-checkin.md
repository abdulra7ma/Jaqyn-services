# B07 — Group Deals, Check-in, Group Redeem (Core Loop 2, Sprint 3)

Phase: 4 · Scope: later · Depends on: B06, B03

## Goal
Customers create/join groups via invite link, check in at merchant, staff verify +
redeem group reward.

## Models
GroupDeal · GroupMember (+ QRCodeToken group_invite/group_checkin/group_reward).

## Endpoints
- `POST /api/groups/` 👤 {group_offer, visit_time}
- `GET /api/groups/{invite_token}/` (public)
- `POST /api/groups/{id}/join/` · `leave/` · `cancel/` (leader)
- `POST /api/groups/{id}/check-in/` 👤 {approval_code?}
- `POST /api/groups/{id}/redeem/` 🧑‍💼  (also `staff/groups/{id}/verify|redeem`)
- `GET /api/customer/groups/` 👤

## Logic
- Create (§11.3): offer active · visit_time within valid_days/time window ·
  daily group cap not exceeded (else `GROUP_NOT_ACTIVE`). Create GroupDeal
  (status `forming`), add leader as GroupMember(`joined`), gen invite_token.
  Emit `group_created`.
- Join (§11.4): group forming/scheduled · not full (`GROUP_FULL`) · not already
  member (unique) · offer active. Add member. If members ≥ min_group_size →
  `full`/`scheduled`; enqueue `send_group_full_notification`. Emit `group_joined`.
- Check-in (§11.5): caller is member (`NOT_GROUP_MEMBER`) · within check-in window
  around visit_time (`GROUP_CHECKIN_CLOSED`) · offer active · business matches.
  Member → `checked_in` (once). When checked-in ≥ min_group_size → group
  `completed`/ready, gen `reward_code`. Emit `group_checked_in`, `group_completed`.
- Staff redeem (§11.6): group belongs to staff business (`WRONG_BUSINESS`) ·
  enough checked-in (`GROUP_NOT_COMPLETE`) · not already redeemed · time valid.
  → status `completed`, set redeemed_at, ScanLog + redemption log.
- Beat `expire_old_groups`: forming/scheduled past expiry → `expired`/`failed`.

## Acceptance (TBD §11.3–11.6, §21.4, Sprint 3)
- create in/out of valid time · join · join full fails · join twice fails ·
  reaches required size · check-in in/out of window · non-member check-in fails ·
  reward unlocks only after enough check-ins · staff redeems once · incomplete fails.

## Definition of Done
Race-safe membership + check-in counts · status machine correct · all logs ·
tests for every acceptance bullet · admin inspectable.

## Checkpoint update
B07 = DONE. **Sprint 3 acceptance (group lifecycle) passes** — note the run.
