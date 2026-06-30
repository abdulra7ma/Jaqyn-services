---
title: Backend Architecture
service: backend
type: reference
status: active
last_reviewed: 2026-06-30---

# Backend Architecture

What the code actually does, cross-checked against `.claude/rules/backend.md`.

## Layering

```
HTTP → DRF view → serializer (shape) → service (business logic) → models → DB
```

- **Models** (`apps/*/models.py`) hold data + invariants. All inherit
  `UUIDModel` / `TimeStampedModel` from `core/fields.py` (UUID PK, `created_at`
  auto-add, `updated_at` auto-now).
- **Serializers** (`apps/*/serializers.py`) validate shape/format.
- **Services** hold business logic. Small apps keep a flat `services.py`
  (`accounts`, `businesses`, `qr`, `staff`, `reporting`, `notifications`).
  Larger apps use a `services/` package split by responsibility
  (`campaigns/services/{eligibility,progress,rewards,group,social,scanner,fraud,analytics}.py`;
  `loyalty/services/{program,membership,earning,redemption,analytics}.py`).
  This matches the rule that a service module nearing ~300 lines splits *by
  responsibility* into a package.
- **Views** (`apps/*/views.py`, plus `onboarding_views.py`, `admin_views.py`,
  `management_views.py`, `scan_views.py`) parse input, call a service, shape the
  response.

## Domain exceptions → HTTP

- `core/exceptions.py` defines `JaqynAPIException` (subclass of DRF
  `APIException`) carrying a stable `code`, with a central `ERROR_MESSAGES` map
  (e.g. `INVALID_OTP`, `CAMPAIGN_NOT_ELIGIBLE`, `VOUCHER_EXPIRED`).
- `envelope_exception_handler` (registered as DRF `EXCEPTION_HANDLER` in
  `base.py`) maps raised exceptions to the response envelope.

## Response envelope

`core/response.py`:

- Success: `{ "success": true, "data": ..., "message": ... }`
- Error: `{ "success": false, "error": { "code", "message", "details"? } }`

## Cross-cutting

- **Auth/permissions:** default `IsAuthenticated` + JWT (`REST_FRAMEWORK` in
  `base.py`). Per-view permission classes live in `core/permissions.py`.
- **Pagination:** `core.pagination.StandardResultsSetPagination`, default page
  size 25.
- **Throttling:** global anon/user rates plus named scopes for campaign,
  loyalty, staff-manage, business-image, and public-lead write surfaces
  (`DEFAULT_THROTTLE_RATES`, `base.py`).
- **QR / frontend:** QR tokens encode frontend URLs via `FRONTEND_URL`
  (`core/frontend.py`, `core/qr.py`).

## Observations / divergences

- `drf-spectacular` is **not installed** — the rule's "OpenAPI schema generated,
  CI fails if stale" is not in force. `api.md` is hand-maintained instead.
- No URL/header API versioning is present; routes are unversioned under `/api/`.
- `TODO`: confirm how consistently the `transaction.on_commit` Celery rule and
  `select_for_update` rule are applied across services — not audited here.
