---
title: B06 — Group Offers (Sprint 3)
service: backend
type: spec
status: deprecated
last_reviewed: 2026-06-30
---
# B06 — Group Offers (Sprint 3)

Phase: 4 · Scope: later · Depends on: B02

## Goal
Business creates group offers; admin approves; public list of active offers.

## Models
GroupOffer.

## Endpoints  (API.md → Group Offers + Admin)
- `POST/PATCH /api/business/group-offers/...` · `submit-for-approval` · `pause`
  · `activate` (🏪, approved business).
- `GET /api/group-offers/` · `GET /api/group-offers/{id}/` (public, active only).
- Admin: `GET /api/admin/group-offers/pending/`, `approve`, `reject`, `pause`.

## Logic
- Status machine: `draft` → `pending_approval` (submit) → `active` (admin approve)
  / `rejected`. Owner pause/activate between active↔paused. Beat marks past
  `valid_to` → `expired`.
- Public list filters status=`active` and within valid_from/valid_to.
- Validation: min ≤ max group size; time_start < time_end; valid_days non-empty.
- Emit `group_offer_created`, `group_offer_approved`, `group_offer_paused`.

## Acceptance (TBD §21.4 partial, Sprint 3)
- business creates offer · admin approves · only active offers public · status
  transitions enforced.

## Definition of Done
Status guards · admin approval (Admin + REST) · tests · admin inspectable.

## Checkpoint update
B06 = DONE, note status transition guards.
