# F04 — Admin Panel

Phase: 1–7 · Scope: Django Admin first (Sprint 1), custom UI later · Depends on: B02+

## Goal
Platform-team admin. MVP = Django Admin (no separate frontend). Custom dashboard
only if needed later.

## Django Admin coverage (TBD §10.1)
1. User management (search by phone, block via is_active)
2. Business approval (approve/reject/disable actions)
3. Business management
4. Staff management
5. Reward program management
6. Group offer approval (approve/reject/pause actions)
7. Group deal management (mark completed/failed)
8. Scan logs (read, filter by status/business/action)
9. Reward transactions (read-only ledger)
10. Reward redemptions
11. Approval codes (regenerate)
12. Manual reward adjustment (creates RewardTransaction action=adjusted)
13. Customer blocking
14. Merchant disabling

## Admin requirements
- list_display / list_filter / search_fields on every model.
- Custom admin actions for approve/reject/disable/block/regenerate/adjust.
- Admin actions emit analytics events + write audit log (B11).
- Masked/limited PII where appropriate; admin access logged.

## Acceptance (TBD §21.5)
approve/reject business · approve/reject offer · disable business · block customer ·
manual adjustment · view logs — all doable from Django Admin.

## Definition of Done
All 14 functions reachable in Django Admin · actions audited · tested.

## Checkpoint update
F04 = DONE, note which actions are Admin vs REST.
