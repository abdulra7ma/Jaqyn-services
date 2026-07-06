from django.urls import path

from apps.loyalty.views import (
    StaffAwardBatchView,
    StaffAwardView,
    StaffRedeemVoucherView,
)

urlpatterns = [
    path("award/", StaffAwardView.as_view(), name="staff-loyalty-award"),
    path(
        "award-batch/",
        StaffAwardBatchView.as_view(),
        name="staff-loyalty-award-batch",
    ),
    path(
        "redeem-voucher/",
        StaffRedeemVoucherView.as_view(),
        name="staff-loyalty-redeem-voucher",
    ),
]
