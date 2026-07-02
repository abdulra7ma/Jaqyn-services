---
title: Business Onboarding — Production QA Audit
service: frontend + backend
type: qa
status: active
last_reviewed: 2026-07-02
---

# Business Onboarding — Production QA Audit

Scope: the business-owner onboarding flow end-to-end — activate invite →
5-step wizard (identity, type, catalog, staff, review) → submit → admin
verify → live. Checked: API/UI liveness, mock/placeholder data, alignment
with the current (unified Campaign + multi-form Loyalty) platform direction,
and onboarding smoothness.

## Verdict

The flow is **real and well-built**. All 17 frontend hooks hit live backend
endpoints (no mocks/fixtures), file uploads are genuine (compressed to storage,
served from `/media/...`), completion scoring + submit gating + the admin
verify / request-changes loop are all real and transactional. It **aligns with
the new direction**: onboarding is intentionally profile + catalog + staff
only; loyalty programs and campaigns are created post-verification from the
dashboard. No stale old-model references (no single points/stamp toggle).

Issues below are polish + one dead-end + dead code, not a broken pipeline.

## Confirmed — fixed this pass

| # | Sev | Finding | File |
|---|-----|---------|------|
| 1 | HIGH | **Verified→live is a dead-end.** When `onboarding_status==="completed"` the pending screen shows only "Refresh status" + a contact line — no path forward. A verified owner has nowhere to click to reach their dashboard or create their first loyalty program/campaign. This is the onboarding→activation gap. | `OnboardingFlow.tsx` `Pending` (~1195–1266) |
| 2 | MED | **Dead code + placeholder in `schema.ts`.** `BIZ_TYPES` (hardcoded seed catalog), `schemaFor`, `BIZ_TYPE_ORDER`, `STATUS_INFO` (with a hardcoded `"Manas Coffee is approved"` placeholder), and stale types are imported by nothing — the live wizard uses the backend `useBusinessTypes()` and its own inline `STATUS_INFO`. ~100 lines of leftover pre-wiring cruft. | `schema.ts` |
| 3 | MED | **Staff-invite copy overpromises.** Step 4 says "Invite up to 5 teammates" and shows a "Pending" badge, implying an invite was sent. Backend creates a `StaffInvite` row but sends **no email/SMS and mints no token**; the row surfaces in the post-onboarding team roster as "invited" and the owner sets teammates up out-of-band. Reworded to reflect reality. | `OnboardingFlow.tsx` `StageStaff`, `schema.ts` copy |

## Flagged — deferred (out of scope this pass)

- **Real staff-invite delivery (email/SMS).** Needs an SMTP/SMS provider. The
  owner-invite path already sends email via a Celery `on_commit` task
  (`businesses/tasks.py` `send_owner_invite_email`) — copy that pattern for
  staff if/when delivery is wanted. Half-building it (a link to a join flow
  that doesn't exist) would be worse than the honest "added to your team" copy.
- **Full i18n of the wizard.** The whole wizard hardcodes English copy (only
  the submit dialog + owner nav use `@jaqyn/i18n`). Bringing it through i18n is
  its own PR; new copy added this pass matches the existing hardcoded pattern.
- **`catType` hardcoded category dropdown** (`OnboardingFlow.tsx` ~231–234).
  Free-pick client list, not derived from the selected business type's
  categories. Low risk (categories are free-text labels). Backend business-type
  seed doesn't expose category options.
- **`useDeleteGalleryImage` doesn't invalidate `onboarding`.** No impact —
  gallery count isn't a completion-required field.

## Live verification (owner account, real backend)

Logged in as the owner (`+996700000900`, dev OTP) → dashboard → onboarding:
- All onboarding GETs (`me`, `onboarding`, `catalog-items`, `staff-invites`,
  `gallery`, `business-types`) returned **200**.
- Autosave loop proven live: edited Description → `PATCH /api/business/onboarding/`
  **200** → invalidation `GET` → completion score recomputed **43% → 57%**.
- No onboarding-related failures (only customer-only endpoints 403 for the owner
  account — pre-existing, unrelated).
- Verified-live CTAs proven via RTL test against the real component (the seeded
  live business doesn't have `onboarding_status="completed"`, so the natural path
  doesn't reach the stage-6 screen — see observation below).

**Observation (not fixed — seed-data artifact):** an already-approved business
(`status=APPROVED`) whose `onboarding_status` is not `submitted`/`completed`
re-opens `/business/onboarding` into the editable wizard at partial completion
rather than a "you're live" screen. The stage-6 gate keys off
`onboarding_status`, not `status`/`verification_status`. Fine for seeded data;
worth confirming real approvals always set `onboarding_status="completed"`
(`verify_business` does — `onboarding_services.py`).

## Evidence highlights

- FE wiring: every hook → real `/api/business/*` endpoint, correct query-key
  invalidation, multipart uploads with Bearer token. No `mock|fake|stub|fixture`.
- Backend: `submit_onboarding` gates on 7 required fields (name, description,
  phone, address, **logo file** — `bool(business.logo)`, not the `logo_set`
  flag, so it can't be PATCH-faked — business type, ≥1 catalog item); atomic
  status transitions; admin verify publishes + sets discoverable.
- Direction: `apps/campaigns` (unified Campaign: Individual/Group/Social) +
  `apps/loyalty` (durable multi-form LoyaltyProgram: points/stamp/visit) are
  post-onboarding; dashboard "Manage Rewards" CTA + sidebar Campaigns/Loyalty
  are the intended next step.
