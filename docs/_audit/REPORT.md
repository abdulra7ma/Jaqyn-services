# Docs Audit — Phase 1 Report

> Generated 2026-06-30. Every doc verified against code/git, not against its own text.
> Phase 1 writes only this file. Nothing else moved. Awaiting approval before Phase 2.

Code map used for verification:
- `backend/apps/`: accounts, businesses, campaigns, loyalty, notifications, qr, reporting, staff, system
- `frontend/apps/`: web (single Next 14 app, role-routed) · `frontend/packages/`: api, config, i18n, ui
- `landing/`: Vite site
- Shipped landmarks (git): campaigns restructure `d432086`/`ff46922`, loyalty/campaigns split `c189b69`, multi-form loyalty `deb68ba`, responsive sheet `afa16f3`/`340ad32`, design tokens `384ca02`.

---

## 1. Full inventory + verified status

Status legend: **SHIPPED** (feature in code) · **STALE** (code moved on, doc now wrong) · **ACTIVE** (plan not yet in code) · **UNVERIFIABLE** (no code tie).

### Root + meta

| path | kind | status | evidence | action |
|---|---|---|---|---|
| README.md | reference | SHIPPED | quickstart matches `docker-compose` + make targets | keep |
| AGENTS.md | meta | STALE | l.24 says prod = Railway **+ Vercel**; DEPLOY.md says Railway-only — contradiction | rewrite |
| CLAUDE.md | meta | STALE | 29-line abridged twin of AGENTS.md (54 lines), drifted | rewrite → one-line pointer to AGENTS.md |
| DEPLOY.md | spec/plan | STALE | Railway-only deploy described but never verified live; conflicts with AGENTS.md; prod sections aspirational | rewrite (after deploy-target decision) |

### tasks/ — trackers + _shared reference

| path | kind | status | evidence | action |
|---|---|---|---|---|
| tasks/README.md | reference | SHIPPED | tracker layout matches tree | keep |
| tasks/CHECKPOINT.md | tracker | STALE | log stops 2026-06-17; 15+ commits since (split, sheets, multi-form) untracked | rewrite |
| tasks/_local/test-accounts.md | reference | SHIPPED | `seed_test_users` + OTP/password login confirmed | keep (stays in tasks/_local) |
| tasks/_shared/API.md | reference | STALE | lists `POST /api/staff/login/ {business_code,pin}`; staff/urls.py removed it ("moved to campaigns unified scanner") | **relocate → docs/contracts/ + rewrite** |
| tasks/_shared/CONVENTIONS.md | reference | SHIPPED | envelope, 23 error codes, perms, Celery all match code | **relocate → docs/conventions/** |
| tasks/_shared/DOCKER.md | reference | ACTIVE | dev/prod images + compose match; prod path unverified | **relocate → docs/guides/** |
| tasks/_shared/SCHEMAS.md | reference | STALE | pre-restructure; lists groups/GroupOffer as own schema, misses RewardType/Campaign fields (`campaigns/models.py`) | **relocate → docs/schemas/ + rewrite** |
| tasks/_shared/STRUCTURE.md | reference | STALE | claims `apps/groups` (in campaigns now) + 3 frontend apps customer/business/staff (only `apps/web` exists) | **relocate → docs/architecture/ + rewrite** |

### tasks/backend/ — B-trackers

| path | status | evidence | action |
|---|---|---|---|
| B00-project-setup.md | SHIPPED | all apps + config scaffolded | keep |
| B01-auth.md | SHIPPED | accounts: User roles, CustomerProfile, OTP | keep |
| B02-business.md | SHIPPED | businesses: status lifecycle, BusinessType | keep |
| B03-qr-approval-codes.md | SHIPPED | QRCodeToken/ApprovalCode/ScanLog exist, but token types now include GROUP_* — approval-code flow superseded by staff-scan | rewrite |
| B04-loyalty-collect.md | SHIPPED | loyalty: Program/Membership/Transaction | keep |
| B05-redemption.md | SHIPPED | LoyaltyVoucher lifecycle (`loyalty/models.py`) | keep |
| B06-group-offers.md | STALE | no `GroupOffer` model; groups merged into unified Campaign (c189b69) | archive |
| B07-group-deals-checkin.md | SHIPPED | Group/GroupMember in `campaigns/models.py`; mislabels app boundary | rewrite |
| B08-staff-endpoints.md | SHIPPED | staff: StaffMember CASHIER/MANAGER + views | keep |
| B09-reporting.md | SHIPPED | reporting: AdminAuditLog + views | keep |
| B10-notifications.md | SHIPPED | notifications: Preference/Log | keep |
| B11-fraud-admin-hardening.md | UNVERIFIABLE | marked "later"; no fraud rules/rate-limit code found | **judgment call** (keep as active backlog vs drop) |

### tasks/frontend/ — F-trackers + service READMEs

| path | status | evidence | action |
|---|---|---|---|
| F00-setup.md | SHIPPED | monorepo + single web app + packages match | keep |
| F01-customer-pwa.md | SHIPPED | all customer routes + `packages/api/customer` | keep |
| F02-business-dashboard.md | SHIPPED | `/business/*` routes + `packages/api/business` | keep |
| F03-staff-pwa.md | STALE | describes PIN+business_code auth; staff now unified phone-OTP (`/staff/login` → `/login`) | rewrite |
| F04-admin-panel.md | UNVERIFIABLE | no frontend admin routes; admin is Django-unfold backend | **judgment call** (retarget to backend admin vs drop) |
| frontend/README.md | reference | SHIPPED | matches monorepo structure | keep |
| landing/README.md | reference | SHIPPED | matches Vite/React/TS landing | keep |

### docs/specs/ + docs/superpowers/ — plans

| path | status | evidence | action |
|---|---|---|---|
| specs/2026-06-26-campaigns-restructure-design.md | SHIPPED | merged `d432086` | archive |
| specs/2026-06-26-campaigns-restructure-plan.md | SHIPPED | merged `d432086`/`ff46922` | archive |
| specs/2026-06-28-loyalty-campaigns-split-IMPLEMENTATION-PLAN.md | SHIPPED | `c189b69`; apps/{loyalty,campaigns} exist | archive |
| specs/2026-06-28-loyalty-campaigns-split-plan.md | SHIPPED | `c189b69` | archive |
| specs/2026-06-28-multi-form-loyalty-design.md | SHIPPED | `deb68ba` | archive |
| specs/2026-06-29-responsive-sheet-system-plan.md | SHIPPED | `340ad32` (Vaul) | archive |
| specs/2026-06-29-customer-map-redesign.md | ACTIVE | map-first `/nearby` not implemented | keep |
| specs/2026-06-29-loyalty-business-design-plan.md | ACTIVE | design-match business loyalty UI not built | keep |
| specs/2026-06-29-loyalty-wallet-redesign.md | ACTIVE | wallet redesign not in `loyalty/page.tsx` | keep |
| specs/business-onboarding-email-plan.md | ACTIVE | `pending_owner_*` fields only; no landing form/approval flow | keep |
| specs/campaign-rewards-plan.md | ACTIVE | self-marked "Draft—do not implement" | keep |
| specs/images-gallery-location-plan.md | ACTIVE | GalleryImage stub only; no LocationPicker/endpoints | keep |
| specs/landing-refresh-plan.md | ACTIVE | not implemented | keep |
| specs/reports-revamp-plan.md | ACTIVE | `build_business_report` stub, no KPI logic | keep |
| specs/SPEC-TEMPLATE.md | meta | template | keep |
| superpowers/plans/2026-06-25-email-signup-otp.md | SHIPPED | `issue_email_otp`/`verify_email_otp` in services | archive |
| superpowers/plans/2026-06-26-password-reset-and-phone-profile-completion.md | SHIPPED | ResetPasswordView + `profile_completed` | archive |
| superpowers/plans/2026-06-26-staff-scan-unified.md | SHIPPED | ScanDispatchView/resolve_scan | archive |
| superpowers/specs/2026-06-26-password-reset-...-design.md | SHIPPED | design for shipped feature | archive |
| superpowers/specs/2026-06-26-staff-scan-unified-design.md | SHIPPED | design for shipped feature | archive |

### docs/ — contracts, briefs, workflows, qa, design system, assets

| path | kind | status | evidence | action |
|---|---|---|---|---|
| staff-profile-nav-contract.md | contract | SHIPPED | nav/avatar/profile/lang built (`afa16f3`, StaffNav) | relocate → docs/contracts/ |
| staff-scan-impl-contract.md | contract | SHIPPED | StaffScanView + campaigns/staff_views.py (`ff46922`) | relocate → docs/contracts/ |
| staff-scan-redesign-contract.md | contract | SHIPPED | unified scan + result overlays (`17cf0b9`) | relocate → docs/contracts/ |
| staff-scan-flow-design-brief.md | design-brief | SHIPPED | confirm_visit_unified in staff_views.py | relocate → docs/contracts/ |
| banking-rewards-design-brief.md | design-brief | STALE | feature shipped as "campaigns + vouchers", not a distinct "banking" product; terminology misleading | **judgment call** (rewrite vs archive) |
| banking-rewards-tech-spec.md | design-brief | STALE | `presented_at`/`completed_count` fields shipped; title says "banking" not "campaigns" | **judgment call** (rewrite vs archive) |
| campaigns-business-workflow.md | design-brief | ACTIVE | API exists (business_views.py); some endpoints not UI-wired (see liveness report) | relocate → docs/guides/ |
| campaigns-customer-workflow.md | design-brief | ACTIVE | customer_views.py live; 7 cosmetic data-map gaps open | relocate → docs/guides/ |
| qa/campaigns-liveness-report.md | qa-report | ACTIVE | findings still unfixed (clean tree, no addressing commits) | keep (backlog) |
| qa/onboarding-production-audit.md | qa-report | ACTIVE | 3 blockers + 12 high still unfixed | keep (backlog) |
| design-system.md | reference | SHIPPED | in sync with `packages/config/tailwind-preset.js` | keep |
| design-system.dc.html | asset/scratch | UNVERIFIABLE | generated HTML twin; nothing references it; .md is canonical | **judgment call** (delete vs archive) |
| Jaqyn.dc.html (root) | asset/scratch | SHIPPED | design deck; referenced by contracts + code comments; **byte-identical to Jaqyn/Jaqyn.dc.html** | archive → docs/_archive/design-deck/ |
| Jaqyn/Jaqyn.dc.html | asset/scratch | SHIPPED | duplicate of root deck | **delete (dedup)** or archive one copy |
| Jaqyn/deck-stage.js | stray-code | SHIPPED | `<deck-stage>` element; imported by no app code, only the .dc.html decks | archive → docs/_archive/design-deck/ |
| Jaqyn/support.js | stray-code | SHIPPED | print/baseline CSS; imported by no app code, only the decks | archive → docs/_archive/design-deck/ |

---

## 2. Delete list (only empty / superseded-duplicate / valueless scratch)

| path | reason |
|---|---|
| Jaqyn/Jaqyn.dc.html | byte-for-byte duplicate of root `Jaqyn.dc.html` (keep one copy, archived) |
| docs/design-system.dc.html | generated HTML twin of `design-system.md`; nothing imports it; `.md` is canonical and in sync — *flagged as judgment call, see §6* |

Nothing else is proposed for deletion. All other removed-from-root docs are **relocated or archived**, never deleted.

## 3. Archive list → `docs/_archive/` (shipped plans, keep original dates, mark `status: deprecated`)

- specs/2026-06-26-campaigns-restructure-design.md
- specs/2026-06-26-campaigns-restructure-plan.md
- specs/2026-06-28-loyalty-campaigns-split-IMPLEMENTATION-PLAN.md
- specs/2026-06-28-loyalty-campaigns-split-plan.md
- specs/2026-06-28-multi-form-loyalty-design.md
- specs/2026-06-29-responsive-sheet-system-plan.md
- superpowers/plans/2026-06-25-email-signup-otp.md
- superpowers/plans/2026-06-26-password-reset-and-phone-profile-completion.md
- superpowers/plans/2026-06-26-staff-scan-unified.md
- superpowers/specs/2026-06-26-password-reset-and-phone-profile-completion-design.md
- superpowers/specs/2026-06-26-staff-scan-unified-design.md
- tasks/backend/B06-group-offers.md (superseded by unified Campaign)
- Design deck → `docs/_archive/design-deck/`: root `Jaqyn.dc.html` + `Jaqyn/deck-stage.js` + `Jaqyn/support.js`

## 4. Relocate list (preserve history via `git mv`)

| from | to |
|---|---|
| tasks/_shared/CONVENTIONS.md | docs/conventions/ |
| tasks/_shared/SCHEMAS.md | docs/schemas/ (then rewrite vs current models) |
| tasks/_shared/STRUCTURE.md | docs/architecture/ (then rewrite) |
| tasks/_shared/DOCKER.md | docs/guides/ |
| tasks/_shared/API.md | docs/contracts/ (then rewrite vs current endpoints) |
| docs/staff-*-contract.md, staff-scan-flow-design-brief.md | docs/contracts/ |
| docs/campaigns-*-workflow.md | docs/guides/ |
| docs/design-system.md | docs/ (root of docs tree) — already here, no move |

`tasks/` keeps only trackers: `B*`, `F*`, `CHECKPOINT.md`, `README.md`, `_local/`.

## 5. Create list (code needs these; kept lean)

- `docs/README.md`, `docs/INDEX.md` (INDEX generated from frontmatter, not hand-kept)
- **backend/docs/**: README, overview, architecture, api, data-model, configuration, runbook + `apps/<name>.md` stubs for non-trivial apps: accounts, businesses, campaigns, loyalty, qr, staff, reporting, notifications. Skip `system` unless it holds real logic.
- **frontend/docs/**: README, overview, architecture, packages (api/config/i18n/ui), state, routing
- **landing/docs/**: overview, runbook (only)
- **docs/architecture/ADR-loyalty-campaigns-split.md** — the split + single-frontend-app decision shipped with no decision record; STRUCTURE/SCHEMAS drifted because of it.

## 6. Judgment calls — will NOT decide alone

1. ~~**Deployment target.**~~ **RESOLVED (2026-06-30): all services on Railway, no Vercel.** DEPLOY.md is correct; AGENTS.md `+ Vercel` is the error → fix AGENTS.md in Phase 2.
2. **`design-system.dc.html` and the Jaqyn deck.** Delete the generated HTML twins, or archive them as the original design source? `.md` + tailwind-preset already carry the tokens, but the decks are the visual source-of-truth cited by contracts.
3. **Which deck copy survives** — root `Jaqyn.dc.html` vs `Jaqyn/Jaqyn.dc.html` (identical). Recommend keep root (referenced), delete the `Jaqyn/` copy.
4. **B11 fraud-admin-hardening** (UNVERIFIABLE) — live backlog item to keep, or abandoned scope to drop?
5. **F04 admin-panel** (UNVERIFIABLE) — retarget to document the Django-unfold backend admin, or drop (no frontend admin planned)?
6. **banking-rewards briefs** (STALE terminology) — rewrite to "campaigns reward model", or archive as historical?
7. **Open QA findings** — campaigns-liveness + onboarding-audit are current/unfixed; keep as backlog reference (recommended) vs convert to issues elsewhere.

---

### Counts
- Inventoried: 60 docs/assets
- SHIPPED 30 · STALE 9 · ACTIVE 11 · UNVERIFIABLE 4 · meta/template 2 (+ deck assets)
- Proposed: archive 13 · relocate 9 · delete 2 · create ~25 (mostly per-service spine) · 7 judgment calls

**STOP — Phase 1 complete. Approve actions (or adjust the judgment calls) before I branch `docs/cleanup` for Phase 2.**
