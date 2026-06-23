from django.urls import path

from apps.businesses.onboarding_views import (
    CatalogItemDetailView,
    CatalogItemListCreateView,
    OnboardingSubmitView,
    OnboardingView,
    OwnerInviteActivateView,
    OwnerInviteValidateView,
    StaffInviteDetailView,
    StaffInviteListCreateView,
)
from apps.businesses.views import (
    BusinessCoverUploadView,
    BusinessDashboardView,
    BusinessLogoUploadView,
    BusinessMeView,
    BusinessRegisterView,
)
from apps.qr.views import BusinessQRView, RegenerateApprovalCodeView

urlpatterns = [
    path("register/", BusinessRegisterView.as_view(), name="business-register"),
    path("me/", BusinessMeView.as_view(), name="business-me"),
    path("profile/logo/", BusinessLogoUploadView.as_view(), name="business-logo-upload"),
    path("profile/cover/", BusinessCoverUploadView.as_view(), name="business-cover-upload"),
    path("dashboard/", BusinessDashboardView.as_view(), name="business-dashboard"),
    path("qr/", BusinessQRView.as_view(), name="business-qr"),
    path("approval-code/regenerate/", RegenerateApprovalCodeView.as_view(), name="business-approval-code-regenerate"),
    # ---- onboarding ----
    path("invites/validate/", OwnerInviteValidateView.as_view(), name="owner-invite-validate"),
    path("invites/activate/", OwnerInviteActivateView.as_view(), name="owner-invite-activate"),
    path("onboarding/", OnboardingView.as_view(), name="business-onboarding"),
    path("onboarding/submit/", OnboardingSubmitView.as_view(), name="business-onboarding-submit"),
    path("catalog-items/", CatalogItemListCreateView.as_view(), name="business-catalog-items"),
    path("catalog-items/<uuid:item_id>/", CatalogItemDetailView.as_view(), name="business-catalog-item"),
    path("staff-invites/", StaffInviteListCreateView.as_view(), name="business-staff-invites"),
    path("staff-invites/<uuid:invite_id>/", StaffInviteDetailView.as_view(), name="business-staff-invite"),
]
