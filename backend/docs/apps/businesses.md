---
title: businesses app
service: backend
type: reference
status: active
last_reviewed: 2026-06-30---

# businesses

Business records, onboarding, catalog/gallery, invites, discovery, admin review,
trials.

**Models** (`models.py`): `Business` (4 status dimensions: status, onboarding,
verification, visibility), `BusinessType`, `BusinessNote` (review timeline),
`CatalogItem`, `BusinessImage` (gallery, max 8), `StaffInvite`,
`BusinessOwnerInvite`. See `data-model.md`.

**Key services:**
- `services.py` — `register_business`, `register_business_lead` (public landing
  lead), `set_business_logo`/`set_business_cover`/`set_catalog_item_image`
  (server-side image compression), `add_gallery_image`/`remove_gallery_image`,
  `resolve_area`.
- `onboarding_services.py` — `onboarding_state`, `required_fields`/
  `missing_required`, `submit_onboarding`, `generate_owner_invite`/
  `validate_owner_token`/`activate_owner`, `add_business_note`.
- Admin review (in `services.py`): `approve_business`, `reject_business`,
  `disable_business_and_tokens`, `verify_business`, `request_business_changes`.
- `trial_services.py` — `start_trial`, `trial_status`, `expiring_trials`.
- `demo_services.py` — one-click demo business seeding.

**Endpoints:** `/api/business/` (owner), `/api/businesses/` (public discovery +
lead), `/api/admin/` (approval/verification), `/api/business-types/`. See
`api.md`.

**Responsibilities:** owner registration + onboarding wizard, catalog/gallery
management, owner/staff invitations, public profile + nearby discovery, admin
approve/reject/verify/disable with an audited note trail, free-trial lifecycle,
demo-account seeding.
