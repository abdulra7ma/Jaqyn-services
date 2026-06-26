from django.urls import path

from apps.campaigns.views.staff_views import (
    ConfirmGroupView,
    ConfirmSocialView,
    RedeemVoucherView,
    ScanCustomerView,
    ScanDispatchView,
    ScanVoucherView,
    UnifiedConfirmVisitView,
)

# Mounted at /api/staff/campaigns/ (see config/urls.py). Mirrors plan §1.3 staff
# routes — the unified scanner: scan, visit, redeem, confirm-group, confirm-social.
urlpatterns = [
    path("scan/", ScanDispatchView.as_view(), name="staff-campaign-scan"),
    path("scan-customer/", ScanCustomerView.as_view(), name="staff-campaign-scan-customer"),
    path("visit/", UnifiedConfirmVisitView.as_view(), name="staff-campaign-unified-visit"),
    path("scan-voucher/", ScanVoucherView.as_view(), name="staff-campaign-scan-voucher"),
    path("redeem-voucher/", RedeemVoucherView.as_view(), name="staff-campaign-redeem-voucher"),
    path("confirm-group/", ConfirmGroupView.as_view(), name="staff-campaign-confirm-group"),
    path("confirm-social/", ConfirmSocialView.as_view(), name="staff-campaign-confirm-social"),
]
