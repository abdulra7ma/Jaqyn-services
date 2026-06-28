from django.urls import path

from apps.loyalty.views import StaffAwardView, StaffRedeemVoucherView

urlpatterns = [
    path("award/", StaffAwardView.as_view(), name="staff-loyalty-award"),
    path(
        "redeem-voucher/",
        StaffRedeemVoucherView.as_view(),
        name="staff-loyalty-redeem-voucher",
    ),
]
