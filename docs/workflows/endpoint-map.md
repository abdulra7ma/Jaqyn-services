---
title: Endpoint ↔ Frontend Map
service: cross-cutting
type: reference
status: active
last_reviewed: 2026-06-30
---

# Endpoint ↔ Frontend Map

Evidence base for the workflow audit. Every backend REST route (method + path),
its view + URL file, and the frontend call site (`file:line`) that exercises it —
or a verdict where none does.

All frontend calls flow through the typed client in `frontend/packages/api/src/`
(`client.ts` adds the Bearer JWT and refreshes on 401). No `fetch` happens outside
that layer. Backend mounts are in `backend/config/urls.py`.

## Legend

- ✅ **wired** — FE caller and BE route both exist and paths agree.
- 🟠 **orphan (BE)** — route exists, no Next caller (may be Django-admin-only or dead).
- 🔴 **broken** — FE calls a path with no BE route, or paths disagree.
- 🟣 **admin-only** — served to the Django admin/unfold UI, not the Next frontend.

> **Note on provenance:** FE line numbers below were re-verified by direct grep of
> `frontend/packages/api/src/*` on 2026-06-30. An earlier explorer pass produced
> several mismatched line numbers; those were discarded. The gap table at the end
> cites exact lines on **both** sides.

---

## Mount prefixes (`backend/config/urls.py`)

| Prefix | Include | config:line |
|---|---|---|
| `/api/auth/` | `apps.accounts.urls` | 25 |
| `/api/` | `apps.notifications.urls` | 26 |
| `/api/business/` | `apps.businesses.urls` | 27 |
| `/api/business/staff/` | `apps.staff.management_urls` | 28 |
| `/api/business/` | `apps.reporting.business_urls` | 29 |
| `/api/staff/scan/` | `UnifiedStaffScanView` (exact, precedes include) | 32 |
| `/api/staff/` | `apps.staff.urls` | 33 |
| `/api/qr/` | `apps.qr.urls` | 34 |
| `/api/merchant/` | `apps.qr.merchant_urls` | 35 |
| `/api/businesses/` | `apps.businesses.public_urls` | 36 |
| `/api/customer/` | `apps.qr.customer_urls` | 37 |
| `/api/business/campaigns/` | `apps.campaigns.business_urls` | 38 |
| `/api/customer/` | `apps.campaigns.customer_urls` | 39 |
| `/api/staff/campaigns/` | `apps.campaigns.staff_urls` | 40 |
| `/api/business/loyalty/` | `apps.loyalty.business_urls` | 41 |
| `/api/customer/loyalty/` | `apps.loyalty.customer_urls` | 42 |
| `/api/staff/loyalty/` | `apps.loyalty.staff_urls` | 43 |
| `/api/admin/...` | campaigns/businesses/reporting/notifications admin_urls | 44–47 |
| `/api/health/`, `/api/auth/token/refresh/`, `/api/business-types/` | root views | 22–24 |

---

## Auth (`/api/auth/` → `accounts/urls.py`)

| Method | Path | BE view (urls.py:line) | FE caller (file:line) | Status |
|---|---|---|---|---|
| POST | `/api/auth/request-otp/` | RequestOTPView (18) | customer/api.ts:107 | ✅ |
| POST | `/api/auth/verify-otp/` | VerifyOTPView (19) | customer/api.ts:110 | ✅ |
| POST | `/api/auth/request-email-otp/` | RequestEmailOTPView (20) | customer/api.ts:141 | ✅ |
| POST | `/api/auth/verify-email-otp/` | VerifyEmailOTPView (21) | customer/api.ts:144 | ✅ |
| POST | `/api/auth/login-password/` | PasswordLoginView (22) | customer/api.ts:120 | ✅ |
| POST | `/api/auth/request-password-reset/` | RequestPasswordResetView (23) | customer/api.ts:129 | ✅ |
| POST | `/api/auth/reset-password/` | ResetPasswordView (24) | customer/api.ts:132 | ✅ |
| POST | `/api/auth/logout/` | LogoutView (25) | — (FE logout is local: staff/api.ts:44 clears tokens) | 🟠 |
| GET | `/api/auth/me/` | MeView (26) | customer/api.ts:153 | ✅ |
| GET/PATCH | `/api/auth/profile/` | ProfileView (27) | customer/api.ts:158 | ✅ |
| POST | `/api/auth/avatar/` | AvatarUploadView (28) | customer/api.ts:167 | ✅ |
| POST | `/api/auth/token/refresh/` | TokenRefreshView (config:23) | client.ts:6 | ✅ |

## Customer — campaigns / wallet / groups (`customer_urls.py`)

| Method | Path | BE view (urls:line) | FE caller | Status |
|---|---|---|---|---|
| GET | `/api/customer/campaigns/` | CampaignDiscoverView (25) | customer/api.ts:231 | ✅ |
| GET | `/api/customer/campaigns/feed/` | CampaignFeedView (26) | customer/api.ts:237 | ✅ |
| GET | `/api/customer/campaigns/<id>/` | (32) | customer/api.ts:239 | ✅ |
| POST | `/api/customer/campaigns/<id>/join/` | (37) | customer/api.ts:244 | ✅ |
| GET | `/api/customer/campaigns/<id>/catalog/` | (38) | customer/api.ts:255 | ✅ |
| POST | `/api/customer/campaigns/<id>/group/start/` | (43) | customer/api.ts:265 | ✅ |
| GET/POST | `/api/customer/campaign-groups/` | (48) | customer/api.ts:279 | ✅ |
| GET | `/api/customer/campaign-groups/<id>/` | (53) | customer/api.ts:270 | ✅ |
| POST | `/api/customer/campaign-groups/<id>/invite/` | (58) | customer/api.ts:272 | ✅ |
| POST | `/api/customer/campaign-groups/<id>/leave/` | (63) | customer/api.ts:274 | ✅ |
| POST | `/api/customer/campaign-groups/<id>/demo-fill/` | (68) | customer/api.ts:276 | ✅ |
| GET | `/api/customer/campaign-wallet/` | (72) | customer/api.ts:248 | ✅ |
| GET | `/api/customer/campaign-vouchers/<id>/` | (78) | customer/api.ts:250 | ✅ |
| POST | `/api/customer/campaign-vouchers/<id>/present/` | (83) | customer/api.ts:252 | ✅ |
| POST | `/api/customer/campaign-vouchers/<id>/select-item/` | (88) | customer/api.ts:259 | ✅ |

## Customer — loyalty (`loyalty/customer_urls.py`)

| Method | Path | BE view (urls:line) | FE caller | Status |
|---|---|---|---|---|
| GET | `/api/customer/loyalty/cards/` | CustomerCardsView (15) | loyalty/api.ts:9 | ✅ |
| GET | `/api/customer/loyalty/businesses/<id>/loyalty/` | (16) | loyalty/api.ts:10 | ✅ |
| GET | `/api/customer/loyalty/programs/<id>/` | (21) | loyalty/api.ts:11 | ✅ |
| POST | `/api/customer/loyalty/programs/<id>/join/` | (26) | loyalty/api.ts:12 | ✅ |
| GET | `/api/customer/loyalty/programs/<id>/catalog/` | (31) | loyalty/api.ts:14 | ✅ |
| POST | `/api/customer/loyalty/programs/<id>/redeem-points/` | (program detail action) | loyalty/api.ts:13 | ✅ |
| GET | `/api/customer/loyalty/vouchers/` | CustomerVouchersView (36) | loyalty/api.ts:15 | ✅ |
| POST | `/api/customer/loyalty/vouchers/<id>/select-item/` | (37) | loyalty/api.ts:16 | ✅ |

## Customer — discovery & QR

| Method | Path | BE view | FE caller | Status |
|---|---|---|---|---|
| GET | `/api/businesses/nearby/` | PublicBusinessListView (public_urls:11) | customer/api.ts:221 | ✅ |
| GET | `/api/businesses/categories/` | PublicBusinessCategoriesView (public_urls:12) | customer/api.ts:225 | ✅ |
| GET | `/api/businesses/<id>/` | PublicBusinessDetailView (public_urls:14) | customer/api.ts:228 | ✅ |
| GET | `/api/qr/<token>/` | QRResolveView (qr/urls:9) | customer/api.ts:177 | ✅ |
| GET | `/api/customer/qr/` | qr.customer_urls | customer/api.ts:157 | ✅ |
| POST | `/api/businesses/register-lead/` | BusinessLeadCreateView (public_urls:13) | landing site (not Next app) | 🟠 |

## Business — profile / onboarding / dashboard (`businesses/urls.py`)

| Method | Path | BE view (urls:line) | FE caller | Status |
|---|---|---|---|---|
| POST | `/api/business/register/` | BusinessRegisterView (26) | business/api.ts:83 | ✅ |
| GET/PATCH | `/api/business/me/` | BusinessMeView (27) | business/api.ts:84,91 | ✅ |
| POST | `/api/business/profile/logo/` | BusinessLogoUploadView (28) | business/api.ts:88 | ✅ |
| POST | `/api/business/profile/cover/` | BusinessCoverUploadView (29) | business/api.ts:89 | ✅ |
| GET | `/api/business/dashboard/` | BusinessDashboardView (30) | business/api.ts:92 | ✅ |
| GET | `/api/business/qr/` | BusinessQRView (31) | business/api.ts:93 | ✅ |
| POST | `/api/business/approval-code/regenerate/` | RegenerateApprovalCodeView (32) | business/api.ts:95 | ✅ |
| GET | `/api/business-types/` | BusinessTypeListView (config:24) | business/api.ts:110 | ✅ |
| GET | `/api/business/invites/validate/` | OwnerInviteValidateView (34) | business/api.ts:112 | ✅ |
| POST | `/api/business/invites/activate/` | OwnerInviteActivateView (35) | business/api.ts:116 | ✅ |
| GET/PATCH | `/api/business/onboarding/` | OnboardingView (36) | business/api.ts:118,120 | ✅ |
| POST | `/api/business/onboarding/submit/` | OnboardingSubmitView (37) | business/api.ts:121 | ✅ |
| GET/POST | `/api/business/catalog-items/` | CatalogItemListCreateView (38) | business/api.ts:124,126 | ✅ |
| DELETE | `/api/business/catalog-items/<id>/` | CatalogItemDetailView (39) | business/api.ts:127 | ✅ |
| POST | `/api/business/catalog-items/<id>/image/` | CatalogItemImageUploadView (40) | business/api.ts:138 | ✅ |
| GET/POST/DELETE | `/api/business/gallery/[<id>/]` | Gallery views (41,42) | business/api.ts:150–179 | ✅ |
| GET/POST/DELETE | `/api/business/staff-invites/[<id>/]` | StaffInvite views (43,44) | business/api.ts:181–184 | ✅ |
| GET | `/api/business/reports/` | reporting.business_urls (config:29) | business/api.ts:103 | ✅ |
| GET | `/api/business/customers/` | reporting.business_urls (config:29) | business/api.ts:106 | ✅ |

## Business — campaigns authoring (`campaigns/business_urls.py`)

| Method | Path | BE view (urls:line) | FE caller | Status |
|---|---|---|---|---|
| GET/POST | `/api/business/campaigns/` | CampaignListCreateView (24) | business/api.ts:201,208 | ✅ |
| GET/PATCH | `/api/business/campaigns/<id>/` | detail (30) | business/api.ts:205,212 | ✅ |
| POST | `/api/business/campaigns/<id>/publish/` | (35) | business/api.ts:214 (`${action}`) | ✅ |
| POST | `/api/business/campaigns/<id>/pause/` | (40) | business/api.ts:214 | ✅ |
| POST | `/api/business/campaigns/<id>/resume/` | (45) | business/api.ts:214 | ✅ |
| POST | `/api/business/campaigns/<id>/end/` | (50) | business/api.ts:214 | ✅ |
| POST | `/api/business/campaigns/<id>/cancel/` | (55) | business/api.ts:214 | ✅ |
| POST | `/api/business/campaigns/<id>/duplicate/` | (60) | business/api.ts:217 | ✅ |
| GET | `/api/business/campaigns/<id>/participants/` | (65) | business/api.ts:220 | ✅ |
| PATCH | `/api/business/campaigns/<id>/image/` | (70) | business/api.ts:249 | ✅ |
| GET/POST | `/api/business/campaigns/<id>/social-post/` | (75) | business/api.ts:240 | ✅ |
| GET | `/api/business/campaigns/<id>/vouchers/` | (80) | business/api.ts:224 | ✅ |
| POST | `/api/business/campaigns/vouchers/<id>/cancel/` | (25) | business/api.ts:234 | ✅ |
| GET | `/api/business/campaigns/<id>/analytics/` | (85) | business/api.ts:230 | ✅ |

> `business/api.ts:214 campaignAction` posts `/${action}/` where `action ∈
> {publish,pause,resume,end,cancel}` (`business/types.ts:455`); the detail page
> renders exactly those controls per status (`business/campaigns/[id]/page.tsx:76`).

## Business — loyalty authoring (`loyalty/business_urls.py`)

| Method | Path | FE caller | Status |
|---|---|---|---|
| GET/POST | `/api/business/loyalty/programs/` | loyalty/api.ts:17,18 | ✅ |
| GET/PATCH | `/api/business/loyalty/programs/<id>/` | loyalty/api.ts:19,20 | ✅ |
| POST | `/api/business/loyalty/programs/<id>/<action>/` (pause/activate/archive) | loyalty/api.ts:21 | ✅ |

## Staff — management (`staff/management_urls.py`, `/api/business/staff/`)

| Method | Path | BE view (urls:line) | FE caller | Status |
|---|---|---|---|---|
| GET | `/api/business/staff/` | StaffTeamListView (18) | business/api.ts:186,187 (`team`,`staff`) | ✅ |
| GET/PATCH | `/api/business/staff/<id>/` | StaffMemberDetailView (19) | business/api.ts:188,190 | ✅ |
| POST | `/api/business/staff/<id>/suspend/` | StaffSuspendView (20) | business/api.ts:191 | ✅ |
| POST | `/api/business/staff/<id>/reactivate/` | StaffReactivateView (21) | business/api.ts:192 | ✅ |
| POST | `/api/business/staff/<id>/reset-password/` | StaffResetPasswordView (22) | business/api.ts:194 | ✅ |

## Staff — operations (`staff/urls.py` + `campaigns/staff_urls.py` + `loyalty/staff_urls.py`)

| Method | Path | BE view (file:line) | FE caller | Status |
|---|---|---|---|---|
| GET | `/api/staff/today-code/` | StaffTodayCodeView (staff/urls:11) | staff/api.ts:48 | ✅ |
| GET | `/api/staff/recent-activity/` | StaffRecentActivityView (staff/urls:13) | staff/api.ts:54 | ✅ |
| POST | `/api/staff/scan/` | UnifiedStaffScanView (config:32) | staff/api.ts:49,64; loyalty/api.ts:24 | ✅ |
| GET | `/api/staff/programs/` | StaffProgramsView (staff/urls:10) | — | 🟠 |
| POST | `/api/staff/redeem/` | **no route** (staff/urls has none) | staff/api.ts:51 (hook hooks.ts:19, no page) | 🔴 |
| POST | `/api/staff/redeem/manual-code/` | **no route** | staff/api.ts:53 (hook hooks.ts:27, no page) | 🔴 |
| POST | `/api/staff/campaigns/scan-customer/` | (staff_urls:18) | staff/api.ts:59 | ✅ |
| POST | `/api/staff/campaigns/visit/` | UnifiedConfirmVisitView (staff_urls:23) | staff/api.ts:97 | ✅ |
| POST | `/api/staff/campaigns/scan-voucher/` | ScanVoucherView (staff_urls:26) | staff/api.ts:112 | ✅ |
| POST | `/api/staff/campaigns/redeem-voucher/` | (staff_urls:29) | staff/api.ts:137 | ✅ |
| POST | `/api/staff/campaigns/confirm-group/` | (staff_urls:34) | staff/api.ts:139 | ✅ |
| POST | `/api/staff/campaigns/confirm-social/` | (staff_urls:39) | staff/api.ts:147 | ✅ |
| POST | `/api/staff/loyalty/award/` | StaffAwardView (loyalty/staff_urls:6) | loyalty/api.ts:22; staff/api.ts:76 | ✅ |
| POST | `/api/staff/loyalty/redeem-voucher/` | (loyalty/staff_urls:7) | loyalty/api.ts:23; staff/api.ts:136 | ✅ |
| POST | `/api/merchant/<id>/validate-code/` | qr.merchant_urls (config:35) | — | 🟠 |

## Admin (🟣 Django admin / unfold — no Next frontend)

`businesses/admin_urls.py` (14–20): pending queue, approve, reject, disable,
verification queue, verify, request-changes ·
`reporting/admin_urls.py` (14–20): metrics, manual-adjustment, block user, disable
QR token, group fail/complete, scan-logs · `notifications/admin_urls.py`:
notification-logs · `campaigns/admin_urls.py`: placeholder (later phase).

`GET /api/notifications/preferences/` (notifications/urls:6) — no Next caller (🟠).

---

## Verified gap table (the only actionable findings)

After re-grepping both sides, **all** initially-suspected campaign/loyalty/group/
lifecycle mismatches were **false positives** caused by bad explorer line numbers.
Three real findings remain, plus expected admin orphans.

| # | Path | FE evidence (file:line) | BE evidence / absence | Verdict | Fix |
|---|---|---|---|---|---|
| 1 | `POST /api/staff/redeem/` | call `staff/api.ts:51`; hook `staff/hooks.ts:19` `useStaffRedeem`; **no `.tsx` imports it** | `staff/urls.py:10–13` has only programs/today-code/scan/recent-activity. Comment `staff/urls.py:6–8`: "loyalty collect/redeem … moved to campaigns unified scanner" | 🔴 **legacy-dead** (orphan FE method → deleted route; no live UI path) | Delete `redeem`/`redeemManual` from `staff/api.ts:50–53` and `useStaffRedeem`/`useStaffRedeemManual` from `staff/hooks.ts:19,27` |
| 2 | `POST /api/staff/redeem/manual-code/` | call `staff/api.ts:53`; hook `staff/hooks.ts:27`; no page | same — no route | 🔴 **legacy-dead** | (same as #1) |
| 3 | `POST /api/auth/logout/` | none — `staff/api.ts:44 logout()` and `useAuth().logout` only call `tokenStore.clear()` | `accounts/urls.py:25` LogoutView exists | 🟠 **orphan-live** | Either wire logout to `POST /api/auth/logout/` to blacklist the SimpleJWT refresh token, or drop the endpoint. **Security**: refresh token currently survives client logout. |
| 4 | `GET /api/staff/programs/` | none | `staff/urls.py:10` StaffProgramsView exists | 🟠 **orphan-live** | Remove view+route, or surface a staff "programs" screen if intended |
| 5 | `POST /api/businesses/register-lead/` | none in Next app | `public_urls:13` exists; consumed by `landing/` site | 🟠 **expected** (landing, not Next) | none — document only |
| 6 | `POST /api/merchant/<id>/validate-code/` | none | `qr/merchant_urls` exists | 🟠 **orphan-live** (superseded by unified scan) | Confirm deprecated; remove if dead |
| 7 | `/api/admin/**`, `/api/notifications/preferences/` | none | exist | 🟣 **admin/cross-cutting** | none — covered by `admin-operations.md` |

### False positives cleared (for the record)

`catalog` (FE `customer/api.ts:255` = BE `customer_urls:38`), `business/team`
(FE `business/api.ts:187` → `/api/business/staff/` = BE `management_urls:18`),
`campaigns/feed`, `group/start`, `campaign-groups` root, campaign
`participants`/`vouchers`/`analytics`/`vouchers/<id>/cancel`, lifecycle
`resume`/`end`/`cancel`, staff `visit`/`scan-customer`/`confirm-social` — **all ✅
wired**, paths agree on both sides.

### Open question

- Group-campaign **completion**: `docs/guides/campaigns-customer-workflow.md`
  notes the check-in QR token is not yet minted, so a group can be filled but not
  completed from the customer UI. Tracked as a known phase-2 gap — verify against
  `campaigns/services/group.py` during the group-session workflow write-up.
