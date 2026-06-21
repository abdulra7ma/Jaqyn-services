# B02 — Business Registration, Approval, Admin Basics

Phase: 1 · Scope: Sprint 1 · Depends on: B01

## Goal
Business owners register a business (pending), admin approves/rejects, profile
management, dashboard skeleton.

## Models
Business · (StaffMember created in B03).

## Endpoints  (API.md → Business + Admin)
- `POST /api/business/register/` → Business(status=pending), owner = caller
  (promote/confirm role `business_owner`).
- `GET/PATCH /api/business/me/`
- `GET /api/business/dashboard/` (skeleton: counts, fill in B04/B09)
- Admin (Django Admin actions + REST in API.md):
  `GET /api/admin/businesses/pending/`, `approve`, `reject`,
  `POST /api/admin/businesses/{id}/disable/`.

## Logic
- Owner can have one business for MVP. Status starts `pending`.
- approve → status `approved`, emit `business_approved`. reject → `rejected` (+reason).
  disable → `disabled` (deactivate QR/offers).
- Gate: only `approved` businesses may create rewards/offers (enforced in B04/B06).
- Owner endpoints scoped to caller's business only.

## Django Admin
Register User, CustomerProfile, Business with list_display, filters (status,
category), search (name, owner phone), and approve/reject/disable admin actions.

## Acceptance (TBD Phase 1 + §21.5)
- owner registers business · stays pending until admin acts · admin approve/reject ·
  only approved can create offers/rewards · disable works.

## Definition of Done
Envelope responses · permission classes (owner vs admin) · querysets scoped ·
admin actions emit analytics events · tests.

## Checkpoint update
B02 = DONE, note approval flow location (Django Admin and/or REST).
