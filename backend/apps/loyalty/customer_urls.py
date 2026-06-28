from django.urls import path

from apps.loyalty.views import (
    CustomerBusinessLoyaltyView,
    CustomerCardsView,
    CustomerCatalogView,
    CustomerJoinView,
    CustomerProgramView,
    CustomerRedeemPointsView,
    CustomerSelectVoucherItemView,
    CustomerVouchersView,
)

urlpatterns = [
    path("cards/", CustomerCardsView.as_view(), name="customer-loyalty-cards"),
    path(
        "programs/<uuid:program_id>/",
        CustomerProgramView.as_view(),
        name="customer-loyalty-program",
    ),
    path(
        "programs/<uuid:program_id>/join/",
        CustomerJoinView.as_view(),
        name="customer-loyalty-join",
    ),
    path(
        "programs/<uuid:program_id>/redeem-points/",
        CustomerRedeemPointsView.as_view(),
        name="customer-loyalty-redeem-points",
    ),
    path(
        "programs/<uuid:program_id>/catalog/",
        CustomerCatalogView.as_view(),
        name="customer-loyalty-catalog",
    ),
    path("vouchers/", CustomerVouchersView.as_view(), name="customer-loyalty-vouchers"),
    path(
        "vouchers/<uuid:voucher_id>/select-item/",
        CustomerSelectVoucherItemView.as_view(),
        name="customer-loyalty-select-item",
    ),
    path(
        "businesses/<uuid:business_id>/loyalty/",
        CustomerBusinessLoyaltyView.as_view(),
        name="customer-business-loyalty",
    ),
]
