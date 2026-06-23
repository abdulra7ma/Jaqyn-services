# Campaign Rewards — Implementation Plan

Status: **Draft for approval — do not implement yet.**
Source: feature definition (§1–25) + design `Jaqyn Campaign Rewards.dc.html`.
Scope: backend (`apps.campaigns`) + frontend (`apps/web` + `@jaqyn/api`), MVP first.

This plan defers to `@.claude/rules/backend.md` and `@.claude/rules/frontend.md` for all standards. It only describes *what* to build and *in what order*.

---

## 0. Key integration decisions (read first)

These shape everything below. Each is a place where the spec/design meets the existing app and a choice had to be made.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **New Django app `apps.campaigns`** — not folded into `apps.loyalty`. | Loyalty = permanent stamp/visit/spend cards. Campaigns = temporary, dated challenges with their own lifecycle, group sessions, and voucher model. Different domain, kept independent per service-layer rule. |
| D2 | **Reuse `apps.qr.QRCodeToken` for all QR.** It already has `Type.CAMPAIGN`, `Type.GROUP_INVITE/CHECKIN/REWARD`, `Type.CUSTOMER_PROFILE`, `Type.REWARD_REDEEM`, and a `campaign` UUID field. | The plumbing exists. Visit-counting reuses the **existing customer personal QR** (`CUSTOMER_PROFILE`) — staff already scan it for loyalty collect. We add a campaign-voucher token type for redemption. |
| D3 | **Visit confirmation extends the existing staff-scan/collect seam.** Staff scans the same customer QR; the scan result now also surfaces *eligible campaigns* alongside loyalty. | The design's staff screen is a mode toggle ("Confirm visit" / "Redeem reward") over one scanner — mirrors `/staff/scan` today. No second QR for the customer to manage. |
| D4 | **New `CampaignRewardVoucher` model** rather than reusing `loyalty.RewardRedemption`. | Campaign vouchers carry campaign/group provenance, different statuses (Active/Redeemed/Expired/Cancelled), and a 7-day-after-unlock expiry distinct from loyalty redemptions. Reuse the *patterns* (code alphabet, QR token mint, redeem-under-lock), not the table. |
| D5 | **No Branch entity exists.** Backend models multi-location as separate `Business` rows; the design's "Chuy branch" is cosmetic. | **MVP: drop branch scope.** A campaign belongs to one `Business`; redemption is valid at that business. Model `branch_*` fields are **deferred** (see Open Questions Q1). Staff/voucher screens show business name, not branch, in MVP. |
| D6 | **Reward issuance, notifications, and analytics roll-ups go through `transaction.on_commit` → Celery**, passing ids. | Non-negotiable Celery-with-Postgres rule. The completion path writes voucher in the same atomic block, then schedules notify on commit. |
| D7 | **Group campaigns are IN MVP** (your call). All three types — visit, time-window, group — ship in Phase 1. | Group is the social differentiator; built alongside visit/time-window. Group reward = **leader gets one voucher** (§11 MVP). |
| D8 | **Social Post Studio is out of MVP scope.** | It's a content-generation surface, not part of the core "challenge → voucher → redeem" loop. Tracked as a later phase; the auto-join link it depends on (D9) is in MVP. |
| D9 | **Auto-join link** (`jaqyn.kg/c/<token>`) is in MVP — it's how time-window/visit campaigns acquire customers and the design's primary acquisition mechanic. | Resolves to campaign detail; `auto_join_enabled` campaigns enrol on first visit even without tapping join. |

---

## 1. Backend plan — `apps.campaigns`

Package layout (services split by responsibility per the ~300-line rule):

```
backend/apps/campaigns/
  __init__.py
  apps.py
  models.py
  serializers.py
  services/
    __init__.py              # re-exports public surface
    campaign.py              # CampaignService
    eligibility.py           # CampaignEligibilityService
    progress.py              # CampaignProgressService
    rewards.py               # CampaignRewardService
    scanner.py               # StaffScannerService (campaign-aware scan)
    fraud.py                 # FraudService
    analytics.py             # campaign metric roll-ups
  views/
    business_views.py        # owner/manager CRUD + analytics
    customer_views.py        # discover / detail / join / progress / wallet
    staff_views.py           # confirm visit / redeem voucher
  business_urls.py
  customer_urls.py
  staff_urls.py
  admin_urls.py              # platform admin (later)
  tasks.py                   # celery: expiry, notifications, fraud sweep
  constants.py               # named magic values w/ provenance comments
  tests/
```

### 1.1 Models (`models.py`)

All inherit `core.fields.TimeStampedModel` (UUID pk + timestamps). Enums via `TextChoices`. Money/cost via `Decimal`. `USE_TZ` datetimes only.

- **Campaign** — business (FK), created_by (FK User), name, description, image, `campaign_type` (VISIT/TIME_WINDOW/GROUP), `status` (DRAFT/SCHEDULED/ACTIVE/PAUSED/ENDED/CANCELLED), start_at, end_at, active_days (JSON list of weekday ints), active_start_time, active_end_time, max_participants, max_rewards, completion_limit_per_customer (enum: ONCE/REPEATABLE), auto_join_enabled, allow_multiple_campaign_counting. *(branch_scope deferred — D5.)*
- **CampaignRule** — campaign (1:1 or FK), rule_type, required_count, minimum_time_between_actions (Duration), max_count_per_day, required_group_size, group_checkin_window_minutes, window_before_time (for time-window).
- **CampaignReward** — campaign (1:1), reward_type (FREE_ITEM/DISCOUNT/UPGRADE/CUSTOM), title, description, estimated_cost (Decimal), expiry_days_after_unlock, max_redemptions, reward_receiver_type (group only: LEADER/EVERY_MEMBER/TABLE).
- **CampaignParticipant** — campaign, customer, `status` (JOINED/IN_PROGRESS/COMPLETED/REDEEMED), progress_count, joined_at, completed_at, last_progress_at. Unique `(campaign, customer)` for ONCE campaigns; for REPEATABLE, add a completion-cycle index.
- **CampaignAction** — campaign, participant, customer, business, action_type (VISIT/GROUP_CHECKIN/REFERRAL), verified_by_staff (FK StaffMember), verification_method, action_time, status, metadata (JSON). The verified-visit audit row.
- **CampaignRewardVoucher** — campaign, customer, business, reward (FK), voucher_code (unique, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), qr_token (FK QRCodeToken, type CAMPAIGN_REWARD), `status` (ACTIVE/REDEEMED/EXPIRED/CANCELLED), issued_at, expires_at, redeemed_at, redeemed_by_staff (FK), cancel_reason. *(redemption_branch deferred.)*
- **GroupSession** (Phase 2 schema now) — campaign, group_leader (FK customer), status, required_size, expires_at, completed_at.
- **GroupSessionMember** — group_session, customer, joined_at, checked_in_at, status.

Audit: reuse `apps.reporting.AdminAuditLog` for admin/manager actions (cancel voucher, disable campaign) and `apps.qr.ScanLog` for every staff scan (already the audit seam).

Add to `apps.qr.QRCodeToken.Type`: `CAMPAIGN_REWARD` (voucher redeem). `CAMPAIGN`, `GROUP_*` already exist.

### 1.2 Services (`services/`)

Functions raise `core.exceptions.JaqynAPIException` with codes; no error sentinels. `@transaction.atomic` on multi-write; `select_for_update` on progress/voucher/reward-counter mutation under contention. Docstrings are source of truth and updated with any logic change. Every static literal (limits, alphabets, durations) lives in `constants.py` with a provenance comment.

- **CampaignService** — `create_campaign`, `update_campaign`, `publish_campaign` (validates: reward present, end>start, required_count set, max_rewards valid, business owns it — §23), `pause`, `resume`, `end`, `cancel`, `get_active_campaigns_for_business`, `discover_for_customer`.
- **CampaignEligibilityService** — pure check pipeline (§13): `check_campaign_active`, `check_date_time_window`, `check_branch` (no-op MVP), `check_customer_eligibility`, `check_daily_limit`, `check_min_time_between_visits`, `check_reward_limit`. Returns a structured `EligibilityResult` dataclass (eligible: bool, reason, campaign) — never a bare dict.
- **CampaignProgressService** — `join_campaign`, `auto_join_customer`, `record_campaign_action` (locks participant row, runs eligibility, increments, detects completion), `complete_campaign` (marks participant, issues voucher in same txn, schedules notify on_commit). Multiple-campaign priority resolver per §14 (customer-selected → closest-to-complete → ending-soonest → newest).
- **CampaignRewardService** — `issue_reward_voucher` (mint code + QRCodeToken, set expiry = unlock + expiry_days), `validate_reward_voucher` (§19 redemption preconditions), `redeem_reward_voucher` (lock, verify staff perm + business + status + not expired, set redeemed_*), `expire_vouchers` (batch), `cancel_voucher` (manager-only, requires reason → AdminAuditLog).
- **StaffScannerService** — `scan_customer_qr` (resolve CUSTOMER_PROFILE token → list eligible campaigns + loyalty), `confirm_visit` (→ ProgressService), `scan_reward_qr` (resolve CAMPAIGN_REWARD → validate), `confirm_group_visit` (Phase 2), `manual_code_lookup`.
- **FraudService** (MVP basic, §15) — `detect_duplicate_visit` (min-interval guard, called inside record_action), `detect_staff_abuse` (N confirms / window), `detect_unusual_redemption`, `flag_suspicious_activity` → AdminAuditLog + business notification. Alert thresholds in `constants.py`.
- **analytics.py** — `campaign_metrics(campaign)` returns a typed `CampaignMetrics` dataclass (views, joined, active, completed, issued, redeemed, redemption_rate, est_cost, new_vs_returning) for the detail screen. Counters maintained incrementally where hot; computed on read where cheap.

### 1.3 API surface

Views hold zero logic — parse, call service, shape response via `core.response.success_response`. Explicit `serializer_class`, `permission_classes`, `queryset`. Every list paginated (`StandardResultsSetPagination`, page 25 / max 100). Throttle every write. drf-spectacular schema regenerated (CI gate).

Routes (registered in `config/urls.py` alongside existing includes):

```
# Business (IsBusinessOwner; manager-gated actions check StaffMember.role)
GET    /api/business/campaigns/                  list + summary KPIs
POST   /api/business/campaigns/                  create (draft)
GET    /api/business/campaigns/{id}/             detail
PUT    /api/business/campaigns/{id}/             edit draft
POST   /api/business/campaigns/{id}/publish/
POST   /api/business/campaigns/{id}/pause/
POST   /api/business/campaigns/{id}/resume/
POST   /api/business/campaigns/{id}/end/
POST   /api/business/campaigns/{id}/cancel/
POST   /api/business/campaigns/{id}/duplicate/
GET    /api/business/campaigns/{id}/participants/
GET    /api/business/campaigns/{id}/vouchers/
GET    /api/business/campaigns/{id}/analytics/
POST   /api/business/campaigns/vouchers/{id}/cancel/   manager-only

# Customer (IsCustomer)
GET    /api/customer/campaigns/                  discover
GET    /api/customer/campaigns/{id}/             detail + my progress
POST   /api/customer/campaigns/{id}/join/
GET    /api/customer/campaign-wallet/            active/used/expired vouchers
GET    /api/customer/campaign-vouchers/{id}/     voucher QR view
POST   /api/customer/campaign-vouchers/{id}/present/   (waiting-for-staff state)
# group (Phase 2): POST .../group/start, /group/{id}, /group/{id}/invite

# Staff (IsStaff; campaign-aware scan)
POST   /api/staff/campaigns/scan-customer/       resolve QR → eligible campaigns
POST   /api/staff/campaigns/confirm-visit/       count a visit
POST   /api/staff/campaigns/scan-voucher/        resolve campaign voucher
POST   /api/staff/campaigns/redeem-voucher/      redeem
# group (Phase 2): /confirm-group

# Auto-join link target → resolves via existing /q/{token} (qr app) to campaign
```

### 1.4 Celery (`tasks.py`)

All idempotent, take ids, `max_retries`/`retry_backoff`/time-limit set. Scheduled via `config/celery.py` beat (alongside existing `expire-rewards-hourly`):

- `expire_campaign_vouchers` (hourly) → `CampaignRewardService.expire_vouchers`.
- `transition_campaign_lifecycle` (every ~15 min) → Scheduled→Active at start_at, Active→Ended at end_at.
- `notify_*` tasks (visit counted, reward unlocked, expiring soon, campaign ending) → call into `apps.notifications`. Scheduled only via `on_commit` from services.
- `sweep_campaign_fraud` (configurable) → FraudService.

### 1.5 Migrations

Separate schema vs data files. Large-table touches (CampaignAction, vouchers) follow add-nullable → backfill → constrain. No logic in migrations. Group tables ship in the initial schema migration even though group logic is Phase 2 (avoids later churn — D7).

### 1.6 Tests (pytest + factory_boy)

Per `backend.md`: every endpoint gets auth + permission + happy-path. List endpoints assert query counts with `django_assert_num_queries` (N+1 gate). Invariant tests back the docstrings:

- Eligibility pipeline: each §13 check rejects correctly (date, window, daily limit, min-gap, reward cap, paused).
- Completion (§19): progress ≥ required + active + under cap + under completion-limit ⇒ exactly one voucher issued; over-cap ⇒ none.
- Redemption (§19): valid path flips status once; double-redeem rejected; expired rejected; wrong-business rejected; non-manager cancel rejected.
- Concurrency: two simultaneous confirm-visits don't double-count (select_for_update).
- Multiple-campaign priority (§14) resolves to one campaign per visit by default.

---

## 2. Frontend plan — `apps/web` + `@jaqyn/api`

Single responsive app (customer + staff mobile shells, business desktop OwnerShell). Server Components by default; `'use client'` pushed to leaves (QR display, scanner, wizard inputs, polling). Server/remote state in TanStack Query only; query keys from the typed factory. All copy through `@jaqyn/i18n`. Tokens from the Tailwind preset (already the exact terracotta/cream/sage palette the design uses — no new hex). Visual primitives from `@jaqyn/ui` + existing `_components` (RewardCard, OfferCover, CoverTag, InitialTile, StampRow, ListGroup, PageTitle, BackButton).

### 2.1 `@jaqyn/api` additions

- `src/customer/types.ts` — `Campaign`, `CampaignProgress`, `CampaignVoucher`, `CampaignWallet`, `GroupSession` (zod-validated at the boundary).
- `src/customer/hooks.ts` — extend `qk`: `campaigns`, `campaign(id)`, `campaignWallet`, `campaignVoucher(id)`. Hooks: `useCampaigns`, `useCampaign`, `useJoinCampaign`, `useCampaignWallet`, `useCampaignVoucher`, `usePresentVoucher`. Polling (`refetchInterval`) on voucher + progress like the existing QR/wallet screens, so a staff-side scan reflects live.
- `src/business/hooks.ts` — extend `bqk`: `campaigns`, `campaign(id)`, `campaignParticipants(id)`, `campaignVouchers(id)`, `campaignAnalytics(id)`. Hooks for list/detail/create/update/lifecycle-action/duplicate/cancel-voucher. Mutations invalidate the right keys.
- `src/staff/hooks.ts` — `useScanCustomerForCampaigns`, `useConfirmVisit`, `useScanCampaignVoucher`, `useRedeemCampaignVoucher`.
- Mock layer (`USE_MOCKS`) seeded from the design's `seed()` data so screens build before backend lands.

### 2.2 Customer routes (`apps/web/app/`)

Mirror the design's bottom-nav (Discover / Wallet / Group) + QR FAB. Each segment gets `loading.tsx` + `error.tsx`.

| Route | Screen (design) |
|-------|-----------------|
| `/campaigns` | Discover — campaign cards w/ progress + reward + ends-in |
| `/campaigns/[id]` | Detail — gradient hero, reward, challenge, how-it-works steps, rules, join/QR/completed CTA |
| `/campaigns/visit-qr` | **Dedicated visit-QR screen** (your call — separate from `/qr`): reuses the QR-render component but its own route, with the "eligible right now" list |
| `/campaign-wallet` | Wallet — Active / Used / Expired voucher groups |
| `/campaign-wallet/[id]` | Voucher QR — gradient reward card, QR, code, "waiting for staff" / redeemed states |
| `/campaigns/[id]/group` | Group session (MVP) — progress, members, invite link/QR |

Note: visit-qr reuses the QR-render component and the customer's `CUSTOMER_PROFILE` token, but lives on its own route (decision: not folded into `/qr`).

### 2.3 Staff routes

Extend the existing `/staff/scan` rather than add a parallel scanner. Add the design's mode toggle (Confirm visit / Redeem reward) and the result bottom-sheets: visit-eligibility (tap campaigns to count) → visit-counted → campaign-complete (reward issued); reward-valid → reward-redeemed; invalid-voucher reasons. Reuse `QrScanner.tsx`. Activity log extends `/staff/activity`.

### 2.4 Business routes (`apps/web/app/business/`)

Reuse OwnerShell + the existing `/business/campaigns` placeholder route (currently empty-state).

| Route | Screen |
|-------|--------|
| `/business/campaigns` | List — 4 KPI cards + campaign table (status/participants/completed/redeemed/ends) |
| `/business/campaigns/new` | Create wizard — 5 steps (type, rules, reward, limits, review) with stepper |
| `/business/campaigns/[id]` | Detail — hero + controls (pause/end/duplicate) + tabs: Overview (metrics+reward+rules) / Participants / Vouchers |

Wizard validation mirrors backend publish rules (§23) client-side (zod) for UX, but the service is the authority. Social Post Studio = later phase (D8).

### 2.5 Frontend tests

Vitest + RTL (behavior, query by role/text), MSW at the network boundary. Playwright e2e for the two critical flows: **customer completes a visit campaign → voucher appears in wallet**, and **staff scans voucher → redeemed**. Add/adjust tests in the same change.

---

## 3. FE ↔ BE contract (core loop)

| Moment | FE action | BE endpoint | Result |
|--------|-----------|-------------|--------|
| Discover | `useCampaigns()` | `GET /api/customer/campaigns/` | active campaigns + my progress |
| Join | `useJoinCampaign()` | `POST .../{id}/join/` | participant JOINED (or auto-join on first visit) |
| Show visit QR | reuse personal QR | (existing `GET /api/customer/qr/`) | CUSTOMER_PROFILE token |
| Staff scans | `useScanCustomerForCampaigns()` | `POST /api/staff/campaigns/scan-customer/` | eligible campaigns + reasons |
| Confirm visit | `useConfirmVisit()` | `POST .../confirm-visit/` | progress++ or completed+voucher |
| Customer sees progress | polling `useCampaign()` | `GET .../{id}/` | live progress |
| Open voucher | `useCampaignVoucher()` | `GET /api/customer/campaign-vouchers/{id}/` | reward QR + code |
| Staff redeems | `useRedeemCampaignVoucher()` | `POST .../redeem-voucher/` | voucher REDEEMED |

All responses use the existing envelope `{success, data, message, error}`. Errors map through the custom DRF handler (`INVALID_QR_TOKEN`, `CAMPAIGN_NOT_ELIGIBLE`, `VOUCHER_EXPIRED`, `VOUCHER_ALREADY_REDEEMED`, `WRONG_BUSINESS`, `PERMISSION_DENIED`, …).

---

## 4. Phasing

- **Phase 1 (MVP):** apps.campaigns app + full models; Campaign/Eligibility/Progress/Reward/Scanner/Fraud services for **VISIT + TIME_WINDOW + GROUP**; business list+wizard+detail; customer discover/detail/wallet/voucher + **group session (start/invite/QR)**; staff confirm-visit + **confirm-group** + redeem; voucher expiry + lifecycle Celery; basic fraud (min-gap, staff-abuse flag); audit logs; auto-join link. Group reward = leader voucher. Tests for every endpoint + invariants.
- **Phase 2 (should-have):** dynamic QR refresh (45s) hardening; fraud alert surfacing to business; campaign duplication polish; customer notifications full set.
- **Phase 3 (later):** Social Post Studio (D8); referral + new-customer campaigns; branch scoping (needs Branch entity — Q1); platform-wide/sponsored campaigns; advanced analytics.

---

## 5. Decisions (resolved — locked for build)

- **Q1 — Branches → DROP scope.** Campaign belongs to one Business; redemption valid at that business. Branch fields deferred (D5).
- **Q2 — Visit QR → SEPARATE screen** (`/campaigns/visit-qr`), not folded into `/qr`.
- **Q3 — One visit → one campaign.** §14 priority resolver; `allow_multiple_campaign_counting` per-campaign opt-in.
- **Q4 — Group reward → LEADER gets one voucher** (§11 MVP).
- **Q5 — Cancellation → live vouchers survive.** Already-issued ACTIVE vouchers stay valid unless explicitly cancelled with a reason.
- **Q6 — Group is IN MVP** (Phase 1, all three types).
```
