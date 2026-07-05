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
    CatalogItemImageUploadView,
    GalleryDetailView,
    GalleryListCreateView,
    OwnerStaffToggleView,
)
from apps.qr.views import BusinessQRView

urlpatterns = [
    path("register/", BusinessRegisterView.as_view(), name="business-register"),
    path("me/", BusinessMeView.as_view(), name="business-me"),
    path("owner-staff/", OwnerStaffToggleView.as_view(), name="business-owner-staff"),
    path("profile/logo/", BusinessLogoUploadView.as_view(), name="business-logo-upload"),
    path("profile/cover/", BusinessCoverUploadView.as_view(), name="business-cover-upload"),
    path("dashboard/", BusinessDashboardView.as_view(), name="business-dashboard"),
    path("qr/", BusinessQRView.as_view(), name="business-qr"),
    # ---- onboarding ----
    path("invites/validate/", OwnerInviteValidateView.as_view(), name="owner-invite-validate"),
    path("invites/activate/", OwnerInviteActivateView.as_view(), name="owner-invite-activate"),
    path("onboarding/", OnboardingView.as_view(), name="business-onboarding"),
    path("onboarding/submit/", OnboardingSubmitView.as_view(), name="business-onboarding-submit"),
    path("catalog-items/", CatalogItemListCreateView.as_view(), name="business-catalog-items"),
    path("catalog-items/<uuid:item_id>/", CatalogItemDetailView.as_view(), name="business-catalog-item"),
    path("catalog-items/<uuid:item_id>/image/", CatalogItemImageUploadView.as_view(), name="business-catalog-item-image"),
    path("gallery/", GalleryListCreateView.as_view(), name="business-gallery"),
    path("gallery/<uuid:image_id>/", GalleryDetailView.as_view(), name="business-gallery-detail"),
    path("staff-invites/", StaffInviteListCreateView.as_view(), name="business-staff-invites"),
    path("staff-invites/<uuid:invite_id>/", StaffInviteDetailView.as_view(), name="business-staff-invite"),
]
