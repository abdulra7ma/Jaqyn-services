---
title: Backend API Reference
service: backend
type: reference
status: active
last_reviewed: 2026-06-30---

# Backend API Reference

REST surface derived from each app's `urls.py` and `config/urls.py`. All under
`/api/`. JWT-authenticated unless noted public. Methods reflect the view class;
where unverified they are marked `TODO`. Envelope/permissions: see
`architecture.md`.

## Root (`config/urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `/api/health/` | GET | `core.views.HealthView` | Liveness check |
| `/api/auth/token/refresh/` | POST | SimpleJWT `TokenRefreshView` | Refresh access token |
| `/api/business-types/` | GET | `businesses.onboarding_views.BusinessTypeListView` | List active business types |
| `/admin/analytics/` | GET | `reporting.analytics.analytics_view` | Admin-only analytics page (in admin shell) |
| `/admin/` | — | Django admin (django-unfold) | Admin site |

## Auth — `/api/auth/` (`accounts/urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `request-otp/` | POST | `RequestOTPView` | Send phone OTP |
| `verify-otp/` | POST | `VerifyOTPView` | Verify phone OTP, issue tokens |
| `request-email-otp/` | POST | `RequestEmailOTPView` | Send email signup OTP |
| `verify-email-otp/` | POST | `VerifyEmailOTPView` | Verify email OTP, issue tokens |
| `login-password/` | POST | `PasswordLoginView` | Email/phone + password login |
| `request-password-reset/` | POST | `RequestPasswordResetView` | Send password-reset code |
| `reset-password/` | POST | `ResetPasswordView` | Reset password (auto-login) |
| `logout/` | POST | `LogoutView` | Blacklist refresh token |
| `me/` | GET | `MeView` | Current user |
| `profile/` | GET/PATCH `TODO` | `ProfileView` | Customer profile |
| `avatar/` | POST | `AvatarUploadView` | Upload avatar |

## Businesses (owner) — `/api/business/` (`businesses/urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `register/` | POST | `BusinessRegisterView` | Owner self-registers a business |
| `me/` | GET/PATCH `TODO` | `BusinessMeView` | Owner's business |
| `profile/logo/` | POST | `BusinessLogoUploadView` | Upload logo |
| `profile/cover/` | POST | `BusinessCoverUploadView` | Upload cover |
| `dashboard/` | GET | `BusinessDashboardView` | Owner dashboard |
| `qr/` | GET | `qr.views.BusinessQRView` | Business collect QR |
| `approval-code/regenerate/` | POST | `qr.views.RegenerateApprovalCodeView` | Rotate approval code |
| `invites/validate/` | POST | `OwnerInviteValidateView` | Validate owner-invite token |
| `invites/activate/` | POST | `OwnerInviteActivateView` | Activate owner account from invite |
| `onboarding/` | GET/PATCH `TODO` | `OnboardingView` | Onboarding state |
| `onboarding/submit/` | POST | `OnboardingSubmitView` | Submit onboarding for review |
| `catalog-items/` | GET/POST | `CatalogItemListCreateView` | List/create catalog items |
| `catalog-items/<uuid:item_id>/` | GET/PATCH/DELETE `TODO` | `CatalogItemDetailView` | Catalog item detail |
| `catalog-items/<uuid:item_id>/image/` | POST | `CatalogItemImageUploadView` | Catalog item image |
| `gallery/` | GET/POST | `GalleryListCreateView` | List/add gallery images |
| `gallery/<uuid:image_id>/` | DELETE `TODO` | `GalleryDetailView` | Remove gallery image |
| `staff-invites/` | GET/POST | `StaffInviteListCreateView` | Staff invites |
| `staff-invites/<uuid:invite_id>/` | GET/DELETE `TODO` | `StaffInviteDetailView` | Staff invite detail |

## Businesses (public) — `/api/businesses/` (`businesses/public_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `nearby/` | GET | `PublicBusinessListView` | Nearby/published businesses |
| `categories/` | GET | `PublicBusinessCategoriesView` | Category list |
| `register-lead/` | POST (public) | `BusinessLeadCreateView` | Landing-page lead capture |
| `<uuid:business_id>/` | GET | `PublicBusinessDetailView` | Public business profile |

## Businesses (admin) — `/api/admin/` (`businesses/admin_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `businesses/pending/` | GET | `PendingBusinessesView` | Pending review queue |
| `businesses/<id>/approve/` | POST | `ApproveBusinessView` | Approve |
| `businesses/<id>/reject/` | POST | `RejectBusinessView` | Reject |
| `businesses/<id>/disable/` | POST | `DisableBusinessView` | Disable + tokens |
| `business-verifications/` | GET | `VerificationQueueView` | Verification queue |
| `business-verifications/<id>/verify/` | POST | `VerifyBusinessView` | Verify |
| `business-verifications/<id>/request-changes/` | POST | `RequestChangesView` | Request changes |

## Staff (Manage Staff, owner) — `/api/business/staff/` (`staff/management_urls.py`)

Owner-only; business resolved from `request.user.owned_business`.

| Route | Method | View | Purpose |
|---|---|---|---|
| `` | GET/POST `TODO` | `StaffTeamListView` | Team list / add |
| `<uuid:staff_id>/` | GET/PATCH/DELETE `TODO` | `StaffMemberDetailView` | Member detail / role change / remove |
| `<id>/suspend/` | POST | `StaffSuspendView` | Suspend |
| `<id>/reactivate/` | POST | `StaffReactivateView` | Reactivate |
| `<id>/reset-password/` | POST | `StaffResetPasswordView` | Reset staff password |

## Staff (operational) — `/api/staff/` (`staff/urls.py`)

> Note: the old `POST /api/staff/login {business_code, pin}` route has been
> removed. Staff scanning lives in the campaigns + loyalty unified scanners.

| Route | Method | View | Purpose |
|---|---|---|---|
| `programs/` | GET | `StaffProgramsView` | Programs/campaigns for staff |
| `today-code/` | GET | `qr.views.StaffTodayCodeView` | Today's approval code |
| `scan/` | POST | `staff.views.StaffScanView` | Legacy staff scan |
| `recent-activity/` | GET | `StaffRecentActivityView` | Recent staff activity |
| `scan/` (exact) | POST | `loyalty.scan_views.UnifiedStaffScanView` | Unified till scanner (registered in `config/urls.py` ahead of the `apps.staff` include) |

## Reporting (business) — `/api/business/` (`reporting/business_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `reports/` | GET | `BusinessReportsView` | Business reports |
| `customers/` | GET | `BusinessCustomersView` | Customer list |

## Reporting (admin) — `/api/admin/` (`reporting/admin_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `metrics/` | GET | `AdminMetricsView` | Platform metrics |
| `manual-adjustment/` | POST | `AdminManualAdjustmentView` | Manual loyalty adjustment |
| `users/<id>/block/` | POST | `AdminBlockUserView` | Block user |
| `qr-tokens/<id>/disable/` | POST | `AdminDisableQRTokenView` | Disable QR token |
| `groups/<id>/fail/` | POST | `AdminGroupFailView` | Force-fail group |
| `groups/<id>/complete/` | POST | `AdminGroupCompleteView` | Force-complete group |
| `scan-logs/` | GET | `AdminScanLogsView` | Scan logs |

## QR — `/api/qr/`, `/api/merchant/`, `/api/customer/` (qr `*_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `/api/qr/<str:token>/` | GET (public) | `QRResolveView` | Resolve a QR token |
| `/api/merchant/<uuid:business_id>/validate-code/` | POST | `ValidateApprovalCodeView` | Validate approval code |
| `/api/customer/qr/` | GET | `CustomerProfileQRView` | Customer's personal QR |

## Campaigns (business) — `/api/business/campaigns/` (`campaigns/business_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `` | GET/POST | `CampaignListCreateView` | List/create campaigns |
| `vouchers/<id>/cancel/` | POST | `CampaignVoucherCancelView` | Cancel a voucher |
| `<id>/` | GET/PATCH/DELETE `TODO` | `CampaignDetailView` | Campaign detail |
| `<id>/publish/` | POST | `CampaignPublishView` | Publish |
| `<id>/pause/` | POST | `CampaignPauseView` | Pause |
| `<id>/resume/` | POST | `CampaignResumeView` | Resume |
| `<id>/end/` | POST | `CampaignEndView` | End |
| `<id>/cancel/` | POST | `CampaignCancelView` | Cancel |
| `<id>/duplicate/` | POST | `CampaignDuplicateView` | Duplicate |
| `<id>/participants/` | GET | `CampaignParticipantsView` | Participants |
| `<id>/image/` | POST | `CampaignImageUploadView` | Campaign image |
| `<id>/social-post/` | GET/POST `TODO` | `CampaignSocialPostView` | Generated social post |
| `<id>/vouchers/` | GET | `CampaignVouchersView` | Issued vouchers |
| `<id>/analytics/` | GET | `CampaignAnalyticsView` | Campaign analytics |

## Campaigns (customer) — `/api/customer/` (`campaigns/customer_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `campaigns/` | GET | `CampaignDiscoverView` | Discover campaigns |
| `campaigns/feed/` | GET | `CampaignFeedView` | Campaign feed |
| `campaigns/<id>/` | GET | `CampaignCustomerDetailView` | Campaign detail |
| `campaigns/<id>/join/` | POST | `CampaignJoinView` | Join campaign |
| `campaigns/<id>/catalog/` | GET | `CampaignCatalogView` | Reward-eligible catalog |
| `campaigns/<id>/group/start/` | POST | `GroupSessionStartView` | Start a group session |
| `campaign-groups/` | GET | `GroupSessionListView` | My group sessions |
| `campaign-groups/<id>/` | GET | `GroupSessionDetailView` | Group session detail |
| `campaign-groups/<id>/invite/` | POST `TODO` | `GroupSessionInviteView` | Invite to group |
| `campaign-groups/<id>/leave/` | POST | `GroupSessionLeaveView` | Leave group |
| `campaign-groups/<id>/demo-fill/` | POST | `GroupSessionDemoFillView` | Demo: fill group |
| `campaign-wallet/` | GET | `CampaignWalletView` | Customer voucher wallet |
| `campaign-vouchers/<id>/` | GET | `CampaignVoucherDetailView` | Voucher detail |
| `campaign-vouchers/<id>/present/` | POST | `CampaignVoucherPresentView` | Present voucher (poll UI) |
| `campaign-vouchers/<id>/select-item/` | POST | `CampaignVoucherSelectItemView` | Choose reward item |

## Campaigns (staff) — `/api/staff/campaigns/` (`campaigns/staff_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `scan/` | POST | `ScanDispatchView` | Unified scan dispatch |
| `scan-customer/` | POST | `ScanCustomerView` | Scan customer QR |
| `visit/` | POST | `UnifiedConfirmVisitView` | Confirm a visit |
| `scan-voucher/` | POST | `ScanVoucherView` | Scan a voucher |
| `redeem-voucher/` | POST | `RedeemVoucherView` | Redeem a voucher |
| `confirm-group/` | POST | `ConfirmGroupView` | Confirm group check-in |
| `confirm-social/` | POST | `ConfirmSocialView` | Confirm social proof |

## Campaigns (admin) — `/api/admin/campaigns/`

`urlpatterns = []` — placeholder include for future platform-admin campaign
endpoints (`campaigns/admin_urls.py`).

## Loyalty (business) — `/api/business/loyalty/` (`loyalty/business_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `programs/` | GET/POST | `BusinessProgramListCreateView` | List/create programs |
| `programs/<id>/` | GET/PATCH/DELETE `TODO` | `BusinessProgramDetailView` | Program detail |
| `programs/<id>/pause/` | POST | `PauseProgramView` | Pause |
| `programs/<id>/activate/` | POST | `ActivateProgramView` | Activate |
| `programs/<id>/archive/` | POST | `ArchiveProgramView` | Archive |

## Loyalty (customer) — `/api/customer/loyalty/` (`loyalty/customer_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `cards/` | GET | `CustomerCardsView` | Loyalty wallet (cards) |
| `programs/<id>/` | GET | `CustomerProgramView` | Program detail |
| `programs/<id>/join/` | POST | `CustomerJoinView` | Join program |
| `programs/<id>/redeem-points/` | POST | `CustomerRedeemPointsView` | Redeem points |
| `programs/<id>/catalog/` | GET | `CustomerCatalogView` | Reward catalog |
| `vouchers/` | GET | `CustomerVouchersView` | Loyalty vouchers |
| `vouchers/<id>/select-item/` | POST | `CustomerSelectVoucherItemView` | Choose voucher item |
| `businesses/<id>/loyalty/` | GET | `CustomerBusinessLoyaltyView` | A business's loyalty programs |

## Loyalty (staff) — `/api/staff/loyalty/` (`loyalty/staff_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `award/` | POST | `StaffAwardView` | Award points/stamps/visit |
| `redeem-voucher/` | POST | `StaffRedeemVoucherView` | Redeem loyalty voucher |

## Notifications — `/api/` and `/api/admin/` (notifications `*_urls.py`)

| Route | Method | View | Purpose |
|---|---|---|---|
| `/api/notifications/preferences/` | GET/PATCH `TODO` | `NotificationPreferenceView` | Channel/event prefs |
| `/api/admin/notification-logs/` | GET | `AdminNotificationLogsView` | Notification send logs |
