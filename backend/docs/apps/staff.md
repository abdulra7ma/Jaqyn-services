---
title: staff app
service: backend
type: reference
status: active
last_reviewed: 2026-06-30---

# staff

Staff members of a business and the owner-facing "Manage Staff" surface.

**Models** (`models.py`): `StaffMember` (per business, optional linked `User`,
`pin_hash`, role cashier/manager, `is_active`).

**Key services** (`services.py`): `list_team`, `get_staff_detail`,
`get_staff_member` / `get_staff_for_user`, `change_role`, `set_active`
(suspend/reactivate), `reset_staff_password`, `remove_staff_member`,
`can_add_staff`, `staff_invite_usage`.

**Endpoints:**
- `/api/business/staff/` (`management_urls.py`) — owner-only team CRUD,
  suspend/reactivate, reset-password (business resolved from
  `request.user.owned_business`).
- `/api/staff/` (`urls.py`) — operational: programs, today-code,
  recent-activity, and a legacy `scan/`.

> The old `POST /api/staff/login {business_code, pin}` is removed. Scanning now
> flows through the campaigns/loyalty unified scanners.

**Responsibilities:** modelling per-business staff, owner management of the team,
and surfacing staff-facing operational data. Action verification itself lives in
campaigns/loyalty (a `StaffMember` is referenced as the verifier there).
