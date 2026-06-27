# Campaigns Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Collapse the `loyalty`, `groups`, and `campaigns` features into one
`Campaign` model with a `type` discriminator (Individual / Group / Social),
restructure business + customer UI around it, and verify end-to-end.

**Architecture:** Single `apps/campaigns` Django app owns the unified schema and
service layer; legacy `apps/loyalty` and `apps/groups` are deleted (pre-launch
clean cut). Frontend consolidates all offer surfaces under `/campaigns` with
outcome-based language. Tests gate each phase.

**Tech Stack:** Django 5 + DRF + Celery (backend) · Next.js 14 App Router +
TanStack Query + Tailwind + `@jaqyn/i18n` (frontend) · pytest · Vitest/RTL ·
Playwright.

**Spec:** `docs/specs/2026-06-26-campaigns-restructure-design.md`

**Branch:** `feat/campaigns-restructure`

---

## Phase ordering

1. **Backend schema + services + migrations** (collapse, delete legacy apps)
2. **Backend API** (unified list/feed/wallet/social-confirm) + schema regen
3. **Frontend API client** (`packages/api`) refactor
4. **Frontend business** (nav, list, create flow, detail tabs)
5. **Frontend customer** (feed, bottom nav, group-entry repoint)
6. **Seed/demo + cleanup + end-to-end verification (UI + backend)**

Each phase ends green (its tests pass) before the next begins.

---

## PHASE 1 — Backend schema + services

### Task 1.1: Extend Campaign type + rule discriminator

**Files:**
- Modify: `backend/apps/campaigns/models.py`
- Test: `backend/apps/campaigns/tests/test_models.py`

- [ ] Add `CampaignType` choices `INDIVIDUAL`, `GROUP`, `SOCIAL` (replace
  `VISIT`/`TIME_WINDOW`/`GROUP`). Add `instagram_handle = CharField(null=True, blank=True)`.
- [ ] On `CampaignRule` add `mechanic` choices `VISIT`/`STAMP`/`SPEND` (Individual
  sub-discriminator), `required_spend = DecimalField(null=True)`,
  `min_spend = DecimalField(null=True)`, `max_banked = PositiveIntegerField(null=True)`.
  Keep `required_group_size`, `group_checkin_window_minutes`.
- [ ] On `CampaignParticipant` add `current_spend = DecimalField(default=0)` and
  `follower_count = PositiveIntegerField(null=True)` (SOCIAL self-entered → reach).
- [ ] On `CampaignAction.action_type` add `SOCIAL_PROOF`.
- [ ] Write tests asserting the new choices exist and defaults are correct.
- [ ] Run `pytest backend/apps/campaigns/tests/test_models.py -q` → PASS.
- [ ] Commit: `feat(campaigns): unify type + rule mechanic discriminators`.

### Task 1.2: Merge GroupSession/GroupSessionMember → Group/GroupMember

**Files:** Modify `backend/apps/campaigns/models.py`, services under
`backend/apps/campaigns/services/group.py`; tests `tests/test_groups.py`.

- [ ] Rename `GroupSession`→`Group`, `GroupSessionMember`→`GroupMember`
  (`group_session` FK → `group`). Keep `campaign` FK, `invite_token` unique,
  `required_size`, `expires_at`, statuses.
- [ ] Update `related_name`s: `campaign.groups`, `group.members`.
- [ ] Update all references in services/serializers/views accordingly.
- [ ] Tests: group formation, member join/leave, full→checking_in→completed.
- [ ] `pytest backend/apps/campaigns/tests/test_groups.py -q` → PASS.
- [ ] Commit: `refactor(campaigns): rename GroupSession→Group`.

### Task 1.3: Port loyalty mechanics into progress service

**Files:** Modify `backend/apps/campaigns/services/progress.py`,
`services/rewards.py`; tests `tests/test_progress.py`.

- [ ] In `CampaignProgressService`, branch INDIVIDUAL by `rule.mechanic`:
  - VISIT: each counted action → `progress_count += 1`; complete at `required_count`.
  - STAMP: like VISIT but honor `max_banked` (cap concurrent unredeemed cycles).
  - SPEND: action carries `amount_spend`; accumulate `current_spend`; complete at `required_spend`.
- [ ] Use `select_for_update` on the participant row for read-modify-write.
- [ ] On completion mint a single `CampaignRewardVoucher` (via `rewards.py`),
  `transaction.on_commit` for any notification side effect.
- [ ] Tests per mechanic: under-threshold no voucher; at-threshold one voucher;
  REPEATABLE cycles; STAMP max_banked cap.
- [ ] `pytest backend/apps/campaigns/tests/test_progress.py -q` → PASS.
- [ ] Commit: `feat(campaigns): visit/stamp/spend mechanics for individual`.

### Task 1.4: Social proof completion path

**Files:** Modify `services/progress.py`, `services/scanner.py`; tests
`tests/test_social.py`.

- [ ] Add `confirm_social_proof(campaign, customer, staff)` → records
  `CampaignAction(SOCIAL_PROOF, verification=STAFF_SCAN)`, marks participant
  COMPLETED, mints voucher. Idempotent per (campaign, customer, cycle).
- [ ] `follower_count` set at join (self-entered) feeds analytics "reach".
- [ ] Tests: confirm → voucher; double-confirm no duplicate voucher.
- [ ] `pytest backend/apps/campaigns/tests/test_social.py -q` → PASS.
- [ ] Commit: `feat(campaigns): social proof completion`.

### Task 1.5: Analytics per type

**Files:** Modify `services/analytics.py`; tests `tests/test_analytics.py`.

- [ ] `CampaignAnalyticsService` returns a typed stat triplet by campaign type:
  - INDIVIDUAL: enrolled, redeemed, close_to_reward (participants ≥ 80% progress).
  - GROUP: groups_created, customers_joined, redeemed.
  - SOCIAL: joined, redeemed, reach (sum of follower_count).
- [ ] Return a `@dataclass`, not a bare dict.
- [ ] Tests assert each triplet on seeded data; `django_assert_num_queries`.
- [ ] `pytest backend/apps/campaigns/tests/test_analytics.py -q` → PASS.
- [ ] Commit: `feat(campaigns): per-type analytics triplets`.

### Task 1.6: Delete legacy apps + clean-cut migration

**Files:** Delete `backend/apps/loyalty/`, `backend/apps/groups/`; modify
`backend/config/settings/*` (INSTALLED_APPS), `backend/config/urls.py`;
regenerate `backend/apps/campaigns/migrations/`.

- [ ] Remove `loyalty` + `groups` from INSTALLED_APPS and root URL conf.
- [ ] Delete the two app dirs.
- [ ] Delete `apps/campaigns/migrations/0*.py` (keep `__init__`), run
  `python manage.py makemigrations campaigns` → fresh initial.
- [ ] `python manage.py migrate` on a clean DB → OK.
- [ ] Grep the repo for `apps.loyalty` / `apps.groups` imports → none remain.
- [ ] `pytest backend -q` → full backend suite PASS.
- [ ] Commit: `refactor: delete legacy loyalty + groups apps (clean cut)`.

---

## PHASE 2 — Backend API

### Task 2.1: Business unified list with filters

**Files:** Modify `backend/apps/campaigns/views/business_views.py`,
`serializers.py`, `business_urls.py`; tests `tests/test_business_api.py`.

- [ ] `CampaignListCreateView` GET accepts `?type=individual|group|social` and
  `?status=active|draft|completed`; default + hard-max page size from settings.
- [ ] List serializer returns type badge, status, the 3 type-specific stats, reward.
- [ ] Tests: filter by each type + status; auth; permission; `num_queries` bound.
- [ ] `pytest backend/apps/campaigns/tests/test_business_api.py -q` → PASS.
- [ ] Commit: `feat(api): business campaign list filters`.

### Task 2.2: Tabbed detail payloads

**Files:** Modify `business_views.py`, `serializers.py`; tests same file.

- [ ] `CampaignDetailView` returns overview + (per tab) participants, groups
  (GROUP only), reward_usage (vouchers), analytics, settings.
- [ ] Tests: GROUP detail includes groups; non-group omits it.
- [ ] `pytest …test_business_api.py -q` → PASS. Commit.

### Task 2.3: Customer feed + unified wallet

**Files:** Modify `views/customer_views.py`, `customer_urls.py`, `serializers.py`;
tests `tests/test_customer_api.py`.

- [ ] `GET /customer/campaigns/feed/` → `{followed:[in-progress], discover:[...]}`;
  `discover` filter `all|group|neighborhood|ended`.
- [ ] Wallet on `/customer/campaign-wallet/` returns all `CampaignRewardVoucher`.
- [ ] Tests: feed split correct; wallet lists vouchers; auth; `num_queries`.
- [ ] `pytest …test_customer_api.py -q` → PASS. Commit.

### Task 2.4: Staff social-confirm + scanner dispatch

**Files:** Modify `views/staff_views.py`, `staff_urls.py`, `services/scanner.py`;
tests `tests/test_staff_api.py`.

- [ ] `POST /staff/campaigns/confirm-social/` → `confirm_social_proof`.
- [ ] Unified scan dispatch recognizes SOCIAL participants.
- [ ] Tests: confirm flow; staff permission; idempotency.
- [ ] `pytest …test_staff_api.py -q` → PASS. Commit.

### Task 2.5: Regenerate OpenAPI schema

- [ ] `python manage.py spectacular --file backend/schema.yml` (or project path).
- [ ] `pytest backend -q` → PASS; CI stale-schema gate satisfied.
- [ ] Commit: `chore(api): regenerate OpenAPI schema`.

---

## PHASE 3 — Frontend API client (`packages/api`)

### Task 3.1: Unify query keys + types

**Files:** Modify `frontend/packages/api/src/{customer,business}/{types,api,hooks,adapters}.ts`,
key factories; tests `packages/api/**/*.test.ts`.

- [ ] Replace `business/offers` + `business/rewards` + `group-offers` keys/hooks
  with campaign-typed keys; add `["business","campaigns",{type,status}]`,
  `["customer","campaign-feed",filter]`, `["customer","campaign-wallet"]`.
- [ ] Types: `CampaignType = 'individual'|'group'|'social'`, `CampaignMechanic`,
  feed shape, unified voucher. Parse responses with zod at the boundary.
- [ ] Add hooks: `useCampaignFeed`, `useConfirmSocial` (staff), unified wallet.
- [ ] Remove dead loyalty/group-offer hooks.
- [ ] `pnpm --filter @jaqyn/api test && pnpm --filter @jaqyn/api typecheck` → PASS.
- [ ] Commit: `refactor(api-client): unify campaign keys/hooks/types`.

---

## PHASE 4 — Frontend business

### Task 4.1: Sidebar nav

**Files:** Modify `frontend/apps/web/app/business/_components/OwnerShell.tsx`,
i18n keys.

- [ ] Nav: Dashboard · Campaigns · Rewards/Redemptions · Customers · Analytics ·
  QR Code · Staff · Settings. Remove Loyalty program + Group Deals items.
- [ ] All labels via `@jaqyn/i18n`.
- [ ] Commit: `feat(business): flat campaign-first sidebar`.

### Task 4.2: Campaigns list + filters + cards

**Files:** Modify `app/business/campaigns/page.tsx`, `_components/campaigns.tsx`;
tests `*.test.tsx`.

- [ ] Type filter row + Status filter row; card = type badge + status pill + 3
  type stats + reward. Use `useBusinessCampaigns({type,status})`.
- [ ] RTL test: filtering by type/status renders correct cards (MSW).
- [ ] `pnpm --filter web test` (scoped) → PASS. Commit.

### Task 4.3: Create flow — outcome chooser + templates + adaptive form

**Files:** Modify `app/business/campaigns/new/page.tsx`, `_components/campaigns.tsx`
(constants for outcome labels + templates); tests.

- [ ] Step 1: outcome cards (Reward repeat customers / Bring friends together /
  Reward social sharing) with technical-type subtitle; template quick-starts
  (visit-5, bring-3-friends, spend-1000, post-a-story) prefill state.
- [ ] Step 2: one adaptive form — fields by type/mechanic (visits+mechanic /
  group size & window / IG handle) + reward + limits.
- [ ] RTL: choosing each outcome shows the right fields; a template prefills.
- [ ] `pnpm --filter web test` (scoped) → PASS. Commit.

### Task 4.4: Detail tabs

**Files:** Modify `app/business/campaigns/[id]/page.tsx`; tests.

- [ ] Tabs: Overview · Participants · Groups (GROUP only) · Reward Usage ·
  Analytics · Settings, fed from detail payload.
- [ ] Delete/redirect `app/business/rewards*`, `app/business/offers*`.
- [ ] RTL: Groups tab present only for group campaigns.
- [ ] `pnpm --filter web test` (scoped) + `typecheck` → PASS. Commit.

---

## PHASE 5 — Frontend customer

### Task 5.1: Bottom nav restructure

**Files:** Modify `app/_components/BottomNav.tsx`, `ScanFab`, Home header, i18n.

- [ ] Nav: Home · Rewards (Награды) · [Scan center] · Campaigns (Акции) · Profile.
  Remove Groups tab; convert FAB → raised center button; add Nearby shortcut to
  Home header; repoint old group entry points → `/campaigns`.
- [ ] RTL/Playwright: 5 items, center scan opens scanner.
- [ ] Commit: `feat(customer): centered scan, campaigns-first nav`.

### Task 5.2: Campaigns feed

**Files:** Modify `app/campaigns/page.tsx`, `_components/campaigns.tsx`; tests.

- [ ] "From places you go" swipe row (feed.followed) + "Discover more" chips
  (All/Group/Neighborhood/Ended) over merged list (feed.discover). Cards route
  into existing detail/group screens (kept intact).
- [ ] RTL: sections render; chip filters list (MSW).
- [ ] `pnpm --filter web test` (scoped) → PASS. Commit.

### Task 5.3: Verify group flow screens intact

**Files:** `app/campaigns/[id]/group`, `app/groups/*` (repoint, not rebuild).

- [ ] Confirm all group screens render + transition: offer → create → forming →
  invite (WA/TG/IG) → full → check-in → reward; plus join-via-link + expired.
- [ ] Commit any repoint fixes.

---

## PHASE 6 — Seed/demo + end-to-end verification

### Task 6.1: Seed/demo rewrite

**Files:** Modify `backend/apps/*/management/commands/seed*.py` (or fixtures).

- [ ] Per demo business emit: one Active Social, one Draft Group, one Completed
  Individual campaign (drives Status filter); remove loyalty/group-offer seeds.
- [ ] `python manage.py seed` on clean DB → OK; `pytest backend -q` PASS.
- [ ] Commit: `chore: reseed demo data for unified campaigns`.

### Task 6.2: Backend e2e (live stack)

- [ ] Bring up backend (Docker stack per `local-live-stack` memory).
- [ ] Run migrations + seed in the live container.
- [ ] curl/httpie smoke: business list+filters, create each type, customer feed,
  wallet, staff scan + visit + confirm-group + confirm-social.
- [ ] Record results; fix failures.

### Task 6.3: Frontend e2e (preview)

- [ ] `preview_start`; verify business: nav, list filters, create each type +
  template, detail tabs (Groups only for group).
- [ ] Verify customer: feed sections + chips, bottom nav centered scan,
  Campaigns(Акции) vs Rewards(Награды) labels, full group flow.
- [ ] Capture screenshots / console + network checks; fix failures.
- [ ] Final: `pnpm -w typecheck && pnpm -w lint && pnpm -w test`,
  `pytest backend -q` → all PASS.

---

## Self-review notes

- Spec coverage: every §3–§9 item maps to a task above (schema→1.1–1.6,
  API→2.x, client→3.1, business UI→4.x, customer UI→5.x, seed/e2e→6.x,
  language/templates→4.1/4.3/5.1).
- Reward-cards-preserved: covered by 1.3 (participant/voucher) + customer wallet
  in 2.3 / 5.x.
- Risk areas (scanner, single wallet) exercised by 2.4 + 6.2.
