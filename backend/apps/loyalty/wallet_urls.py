from django.urls import path

from apps.loyalty.views import CustomerBusinessRewardCardView, CustomerPresentRedemptionView, CustomerWalletView

urlpatterns = [
    path("wallet/", CustomerWalletView.as_view(), name="customer-wallet"),
    path("redemptions/<uuid:redemption_id>/present/", CustomerPresentRedemptionView.as_view(), name="customer-redemption-present"),
    path("businesses/<uuid:business_id>/rewards/", CustomerBusinessRewardCardView.as_view(), name="customer-business-rewards"),
]
