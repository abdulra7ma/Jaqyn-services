from django.urls import path

from apps.campaigns.views.staff_views import (
    ConfirmGroupView,
    RedeemVoucherView,
    ScanCustomerView,
    ScanVoucherView,
    UnifiedConfirmVisitView,
)

# Mounted at /api/staff/campaigns/ (see config/urls.py). Mirrors plan §1.3 staff
# routes. Sits alongside the existing loyalty staff scanner at /api/staff/.
urlpatterns = [
    path("scan-customer/", ScanCustomerView.as_view(), name="staff-campaign-scan-customer"),
    path("visit/", UnifiedConfirmVisitView.as_view(), name="staff-campaign-unified-visit"),
    path("scan-voucher/", ScanVoucherView.as_view(), name="staff-campaign-scan-voucher"),
    path("redeem-voucher/", RedeemVoucherView.as_view(), name="staff-campaign-redeem-voucher"),
    path("confirm-group/", ConfirmGroupView.as_view(), name="staff-campaign-confirm-group"),
]
