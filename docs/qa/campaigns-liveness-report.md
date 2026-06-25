# Campaigns Liveness Sweep — QA Report

Verified against real code under `/Users/abdulrahmandawoud/handy/personal/Jaqyn-services`. All line numbers below were re-confirmed by reading the cited files (raw-auditor line numbers were corrected where they drifted).

Legend: **working** = wired end-to-end and functional · **broken** = reachable but errors / shows wrong data · **stub** = reachable but a deliberate no-op · **dead** = unreachable / never called.

---

## Business workflow

| Step | Status | File:line | Fix |
|------|--------|-----------|-----|
| List campaigns — KPI cards (active/participants/issued/redeemed) | **broken** | `frontend/packages/api/src/business/adapters.ts:100-119` (reads `raw.summary.*`); backend `backend/apps/campaigns/views/business_views.py:67-73` returns a plain paginated envelope (no `summary`) | Add a `summary` block to the list endpoint (or a dedicated KPI endpoint) and emit it; cards currently always render `0`. |
| List campaigns — row count columns (participants/completed/redeemed/ends_label) | **broken** | `frontend/packages/api/src/business/adapters.ts:108-118`; `CampaignSerializer` fields `backend/apps/campaigns/serializers.py:120-150` emit none of these | Add per-row aggregates to `CampaignSerializer` or change the adapter to derive from emitted fields; columns always show `0`/`""`. |
| Create campaign — name/type/rule/reward skeleton | **working** | `frontend/apps/web/app/business/campaigns/new/page.tsx:90` → `toCampaignWritePayload` `frontend/packages/api/src/business/adapters.ts:161-205` → `CampaignListCreateView.post` `backend/apps/campaigns/views/business_views.py:75-83` | — |
| Create campaign — schedule/constraint fields (start_at, end_at, active_days, active_hours, min_time_between, group_checkin_window) | **broken** (stub fields) | `toCampaignWritePayload` "KNOWN GAP" block `frontend/packages/api/src/business/adapters.ts:151-159` silently drops all six; wizard collects them at `frontend/apps/web/app/business/_components/campaigns.tsx:165-184` | Make wizard inputs structured (date/time pickers, weekday multiselect) and map to `start_at`/`end_at`/`active_days`/`active_start_time`/`active_end_time`; `active_hours`, `min_time_between`, `group_checkin_window` have no backend field at all — add them or remove the inputs. |
| Create/display — `repeat_policy` round-trip | **broken** (read path) | write OK at `adapters.ts:170-171`; read at `frontend/packages/api/src/business/adapters.ts:68` reads `raw.repeat_policy`, backend emits `completion_limit_per_customer` (`serializers.py:139`) | Add `?? raw.completion_limit_per_customer` fallback on read; UI currently always shows `"once"`. |
| Create — `staff_approval_required` toggle | **broken** (no backend) | collected `frontend/apps/web/app/business/_components/campaigns.tsx:176`; read `adapters.ts:70` (`?? true`); zero backend refs (`grep staff_approval apps/campaigns` empty) | Either implement a backend field + serializer support, or remove the toggle; today it is a pure no-op (always reads `true`, never written). |
| Edit/update campaign (`PUT /api/business/campaigns/{id}/`) | **dead** | hook `frontend/packages/api/src/business/hooks.ts:356`, api `business/api.ts:225`; backend PUT `business_views.py:102-113` — no UI calls `useUpdateCampaign` (zero hits in `apps/web/app`) | Wire an edit screen/button to `useUpdateCampaign`, or drop the hook. Backend is ready. |
| Publish | **working** | `frontend/apps/web/app/business/campaigns/[id]/page.tsx:69,142` → `useCampaignAction` → `CampaignPublishView` `business_views.py:138` | — |
| Pause | **working** | `[id]/page.tsx:70,142` → `CampaignPauseView` `business_views.py:142` | — |
| Resume | **working** | `[id]/page.tsx:71,142` → `CampaignResumeView` `business_views.py:146` | — |
| End | **working** | `[id]/page.tsx:72-73,142` → `CampaignEndView` `business_views.py:150` | — |
| Cancel campaign | **dead** | `CampaignCancelView` `business_views.py:154` + `useCampaignAction` support `"cancel"`, but controls array `[id]/page.tsx:67-73` never pushes `cancel` | Add a cancel control for an appropriate status, or remove the unreachable action from the type. Backend ready. |
| View participants | **working** (2 blank columns) | `[id]/page.tsx:286` → `useCampaignParticipants` → `CampaignParticipantsView` `business_views.py:219`; serializer `serializers.py:324-340` lacks `last_visit_label`/`reward_label` so `adaptParticipant` defaults them to `"—"` | Add `last_visit_label`/`reward_label` to `CampaignParticipantSerializer` or stop rendering those columns. |
| View vouchers | **working** (1 blank column) | `[id]/page.tsx:330` → `useCampaignVouchers` → `CampaignVouchersView` `business_views.py:233`; `CampaignRewardVoucherSerializer` emits `redeemed_at`, no `redeemed_by` name (`serializers.py:19-31`) so column shows `"—"` | Add a `redeemed_by` (staff name) field or drop the column. |
| Cancel a voucher | **broken** (wrong permission for actor) | button on owner page `[id]/page.tsx:331,366,420`; `CampaignVoucherCancelView` `permission_classes = [IsStaff]` `business_views.py:310`; `IsStaff.role="staff"` ≠ `IsBusinessOwner.role="business_owner"` (`backend/core/permissions.py:15-20`) | View docstring says it is manager-StaffMember-gated by design — but the cancel button is rendered on the owner page, so the owner gets 403. Either move the action to a staff surface, broaden the permission, or hide the button for owners. |
| Analytics (Overview tab) | **broken** | `[id]/page.tsx:210-227` reads `c.analytics` from the detail fetch; `CampaignSerializer` (`serializers.py:120-150`) never embeds `analytics`, so `adaptBusinessCampaign` (`adapters.ts:96`) gets `undefined` → all-zeros. The real endpoint `CampaignAnalyticsView` `business_views.py:249` works but is never called from this page. | Call `useCampaignAnalytics(id)` in the Overview tab (the hook/endpoint already exist) instead of reading the embedded zeros. |
| Social Post Studio | **working** | `[id]/page.tsx:134` → `useCampaignSocialPost` → `CampaignSocialPostView` `business_views.py:285`; image upload `CampaignImageUploadView` also wired | — |
| Duplicate campaign | **working** | `[id]/page.tsx:151` → `useDuplicateCampaign` → `CampaignDuplicateView` `business_views.py:158`; copies model fields directly so dates survive | — |
| Staff scan — scan customer / unified visit / scan voucher / redeem voucher | **working** | `frontend/apps/web/app/staff/scan/page.tsx:771,806,821` → `ScanCustomerView`/`UnifiedConfirmVisitView`/`ScanVoucherView`/`RedeemVoucherView` `backend/apps/campaigns/views/staff_views.py` | — |
| Staff scan — group branch off scan-voucher | **dead** | `adaptVoucherScanResult` hard-codes `group: null` `frontend/packages/api/src/staff/adapters.ts:107-108`; `CampaignRewardVoucherSerializer` emits no `group` field; `data.group` branch `staff/scan/page.tsx:784` is unreachable | Implement group resolution in the scan-voucher response (Phase 2 "Q4" seam) or remove the dead branch. |
| Staff scan — confirm-group result display | **broken** | backend `GroupConfirmResultSerializer` emits `{session, member_count, voucher}` `serializers.py:632-646`; frontend `ConfirmGroupResult` expects `{campaign_name, reward_title, expires_label, leader_name}` `frontend/packages/api/src/staff/types.ts:192-197`; `confirmGroup` has no adapter `staff/api.ts:114-115` → overlay subtitle renders `undefined` `staff/scan/page.tsx:959-965` | Add an `adaptConfirmGroupResult` mapping the real shape, or change the serializer to emit the four fields the UI reads. |

---

## Customer workflow

| Step | Status | File:line | Fix |
|------|--------|-----------|-----|
| Nav link → /campaigns | **working** | `frontend/apps/web/app/_components/BottomNav.tsx:22-29` | — |
| Discover list / detail fetch | **working** | `campaigns/page.tsx` → `useCampaigns` → `CampaignDiscoverView` `backend/apps/campaigns/customer_urls.py:20`; detail `CampaignCustomerDetailView` | — |
| Card field — `glyph` | **broken** (cosmetic) | `frontend/packages/api/src/customer/adapters.ts:217,288` read `raw.glyph`; no model/serializer field | Add a `glyph` field or remove `GlyphTile`'s glyph slot (logo fallback already covers it). |
| Card field — `start_label` / `end_label` | **broken** (cosmetic) | `customer/adapters.ts:223-224`; backend emits `start_at`/`end_at` (ISO), not labels | Format `start_at`/`end_at` client-side via i18n, or emit pre-formatted labels. Detail page renders two empty strings. |
| Card field — `days_left` ("Ends today" always) | **broken** (cosmetic) | `customer/adapters.ts:225` (`?? 0`); `endsLabel` `_components/campaigns.tsx:55-58` | Compute `days_left` from `end_at`, or emit it. |
| Card field — `active_hours` | **broken** (cosmetic) | `customer/adapters.ts:227`; backend has separate `active_start_time`/`active_end_time` | Derive from the two time fields, or emit a combined string. |
| Card field — `repeat_policy` ("once" always) | **broken** | `customer/adapters.ts:228` reads `raw.repeat_policy`; backend emits `completion_limit_per_customer` (`serializers.py:139`) | Add `?? raw.completion_limit_per_customer` fallback; rule copy is always the "once" variant today. |
| Join campaign | **working** | `useJoinCampaign` → `CampaignJoinView`; re-fetches detail | — |
| Progress / my_progress | **working** | `CampaignProgressSerializer` `serializers.py:195-220`; `adaptCampaignProgress` infers joined/completed from `status` | — |
| Visit QR display + live eligibility poll | **working** | `campaigns/visit-qr/page.tsx` → `useMyQr` + `useCampaigns` poll | — |
| Staff scan → unified visit advances campaign | **working** | `UnifiedConfirmVisitView` `staff_views.py` → `StaffScannerService.confirm_visit_unified` | — |
| Campaign completion → voucher mint | **working** | `CampaignProgressService.record_campaign_action` → `issue_reward_voucher` (atomic) | — |
| Campaign wallet list | **working** | `useCampaignWallet` → `CampaignWalletView` | — |
| Voucher detail + present-to-staff | **working** | `useCampaignVoucher` + `usePresentVoucher` → `CampaignVoucherPresentView`; `code` resolves via `raw.voucher_code` fallback | — |
| Voucher field — `glyph` | **broken** (cosmetic) | `customer/adapters.ts:288`; no model/serializer field | Add field or drop glyph slot. |
| Staff redeems voucher | **working** | `useRedeemCampaignVoucher` → `RedeemVoucherView` (`select_for_update`) | — |
| Voucher label — cancelled shows "Expired" (compact card) | **broken** (cosmetic) | `statusKey` collapses cancelled→expired `frontend/apps/web/app/_components/campaigns.tsx:310-312` | Return a `"cancelled"` key and render its own label. |
| Voucher tone — cancelled severity inconsistent | **broken** (cosmetic) | business `business/_components/campaigns.tsx:37` = `neutral`; customer `_components/campaigns.tsx:38` = `danger`; wallet detail `campaign-wallet/[id]/page.tsx:18` = `danger` | Align on one tone for `cancelled`. |
| **Group** — check-in QR when group is full | **dead** | `session.checkin_token` always `null`: `GroupSessionSerializer` `serializers.py:393-411` emits no `checkin_token`, model has none; adapter `customer/adapters.ts:362`; render gated `campaigns/[id]/group/page.tsx:103-106` | Mint and emit a group check-in token (model field + serializer), or change the staff flow so a full group is confirmable without a per-session QR. Group completion is currently unreachable from the UI. |
| **Group** — staff confirm path reachability | **dead** | both client paths dead: `adaptVoucherScanResult` `group:null` `staff/adapters.ts:107-108` + no check-in QR; `ConfirmGroupView` `staff_views.py` is implemented but unreachable | Resolve the check-in token + group-scan seam (see above) to make `ConfirmGroupView` reachable. |
| **Group** — confirm result display | **broken** | shape mismatch (see Business table, same finding) `staff/types.ts:192-197` vs `serializers.py:632-646` | Add `adaptConfirmGroupResult`. |
| **Group** — member names show `#XXXXXX` | **broken** (cosmetic) | `GroupSessionSerializer.get_members` emits `customer` id, no name `serializers.py:413-424`; adapter falls back `customer/adapters.ts:145,326` | Emit `customer_name` in `get_members`. |

---

## Dead / orphaned code

Items below are unreachable or never called — safe to remove or wire up.

| Item | Status | File:line | Notes |
|------|--------|-----------|-------|
| `ConfirmVisitView` (`POST /api/staff/campaigns/confirm-visit/`) + `staffApi.confirmVisit` + `useConfirmVisit` | **dead** | `backend/apps/campaigns/staff_urls.py:16`, `staff_views.py:58`; `frontend/packages/api/src/staff/api.ts:71`, `staff/hooks.ts:71` | Superseded by `UnifiedConfirmVisitView` (`visit/`). Zero callers in `apps/web/app` (the `confirmVisit` hit at `staff/scan/page.tsx:217` is the i18n key `staff.campaign.confirmVisit`, not the API). |
| `GroupSessionJoinView` (`POST /api/customer/campaign-groups/join/`) | **dead** | `backend/apps/campaigns/customer_urls.py:24`, `customer_views.py` | No `joinGroupSession` in `CustomerApi`; zero frontend callers. Join happens via the invite/QR flow, not this REST endpoint. |
| `StaffScannerService.manual_code_lookup()` | **dead** | `backend/apps/campaigns/services/scanner.py:370-378` | No view/URL/test references it. |
| `CampaignService.my_participations()` | **dead** | `backend/apps/campaigns/services/campaign.py:494-501` | Zero callers; discovery uses `discover_for_customer`. |
| `CampaignService.get_active_campaigns_for_business()` | **dead** | `backend/apps/campaigns/services/campaign.py:327-339` | Zero callers; list uses `list_for_business`. |
| `useCampaignAnalytics` + `bqk.campaignAnalytics` + `businessApi.campaignAnalytics` | **dead** (FE) | `frontend/packages/api/src/business/hooks.ts:39,341`, `business/api.ts:243` | Hook never imported in any page (the Overview tab reads embedded zeros instead). The backend endpoint itself works — see Analytics row above; the fix is to *call* this hook. |
| `CampaignAnalytics.cost_each` (FE type/adapter) | **dead** | `frontend/packages/api/src/business/types.ts:390`, `business/adapters.ts:50` | Backend `CampaignMetrics`/`CampaignMetricsSerializer` only has `estimated_cost`. No page reads `cost_each`. |
| `BusinessCampaignListResponse.summary` mapping | **dead** (data never flows) | `frontend/packages/api/src/business/adapters.ts:100-107` | Backend list endpoint emits no `summary` key — see Business "List campaigns KPI" row. |
| `useGroupSession` (customer) | **dead** | `frontend/packages/api/src/customer/hooks.ts:133` | Group page drives state from mutation results; query hook never imported in `apps/web/app`. |
| `useUpdateCampaign` (business) | **dead** | `frontend/packages/api/src/business/hooks.ts:356` | No edit UI — see Business "Edit/update" row. |
| `CampaignEligibilityService.check_branch()` | **stub** | `backend/apps/campaigns/services/eligibility.py:108-115` (called `eligibility.py:244`) | Self-described no-op (`return True`) for Phase-3 branch scoping. Intentional seam. |
| `apps/campaigns/admin_urls.py` (`urlpatterns = []`) | **stub** | `backend/apps/campaigns/admin_urls.py:5`, mounted `config/urls.py:33` | Route prefix `/api/admin/campaigns/` is live but empty (404s). Intentional placeholder for plan §4/D8. |
| `GroupSessionMember.Status.LEFT`, `.NO_SHOW` | **dead** | `backend/apps/campaigns/models.py:242-243` | Defined but never set by any service (only `JOINED`/`CHECKED_IN` used). |
| `GroupSession.Status.CHECKING_IN` | **dead** | `backend/apps/campaigns/models.py:216` | Never set; group flow is `FORMING → FULL → COMPLETED/EXPIRED/CANCELLED`. |
| `CampaignAction.ActionType.REFERRAL` | **dead** | `backend/apps/campaigns/models.py:142` | Never set; only `VISIT` is recorded. |
| `Campaign...VerificationMethod.STAFF_MANUAL`, `.AUTO_JOIN` | **dead** | `backend/apps/campaigns/models.py:146-147` | Never set; progress always defaults to `STAFF_SCAN`. |
| `endsLabel` export (FE) | **dead export** (function live) | `frontend/apps/web/app/_components/campaigns.tsx:55` | Only used within its own file (lines 187, 239). Drop the `export`; not load-bearing. |

---

### Notes on rejected / merged raw findings

- **Analytics endpoint itself** (`CampaignAnalyticsView`, `GET .../analytics/`): NOT dead — the view + service + serializer + tests exist and work. Only the *frontend caller* is missing. Counted once as the broken Analytics step + the dead `useCampaignAnalytics` hook; the backend endpoint is "working".
- **`staffApi.confirmVisit`, `useConfirmVisit`, `bqk.campaignAnalytics`, `businessApi.campaignAnalytics`** were reported separately by two auditors; merged into single dead-code rows.
- The `confirm-visit` "i18n key" at `staff/scan/page.tsx:217` is a false-positive caller and was ruled out.

---

## Resolution (2026-06-25)

**Fixed + verified** (web `tsc` clean; `apps/campaigns` 149 passed; live API re-walk):
- Analytics Overview now calls the real `useCampaignAnalytics` endpoint (was all-zeros).
- List endpoint emits a `data.summary` KPI block + per-row participants/completed/redeemed/ends_label (was all-zeros). Query-count gate updated 7→8 (one bounded aggregate).
- Create wizard now sends schedule/constraints — `start_at`/`end_at`/`active_days`/`active_start_time`/`active_end_time` + rule `minimum_time_between_actions`/`window_before_time`/`group_checkin_window_minutes` (parsed from the wizard's free-text inputs; verified persisted).
- `repeat_policy` read fallback to `completion_limit_per_customer` (business + customer).
- Voucher-cancel permission broadened so the **owner** can cancel (was 403 for owners).
- Participant `last_visit_label`/`reward_label` + voucher `redeemed_by` serializer fields added.
- Customer card labels (`start_label`/`end_label`/`days_left`/`active_hours`/`glyph`) computed client-side; cancelled-voucher label/tone distinct from expired.
- Cancel-campaign control added to the detail page.

**Flagged, deliberately not fixed** (documented in the workflow docs):
- Group-campaign completion seam (check-in token + confirm-group display) — Phase-2 feature, not a bug-fix.
- Intentional stubs: `check_branch` no-op, empty `admin_urls`.
- Reserved-but-unused enums and dead duplicate code (`ConfirmVisitView`, `GroupSessionJoinView`, 3 superseded services, `useUpdateCampaign`/edit-UI, `cost_each`, `endsLabel` over-export) — left in place pending an explicit removal decision (skill rule: don't delete without sign-off).
- `test_last_reward_slot_completion_is_threadsafe` fails as a **pre-existing** threaded test-DB-isolation flake (its code, `progress.py`, is unchanged this session); not introduced by these fixes.
