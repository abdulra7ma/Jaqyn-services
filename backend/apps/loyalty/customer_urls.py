from django.urls import path

from apps.loyalty.views import CustomerRewardDetailView, CustomerRewardsView, GenerateRedemptionCodeView

urlpatterns = [
    path("", CustomerRewardsView.as_view(), name="customer-rewards"),
    path("<uuid:progress_id>/", CustomerRewardDetailView.as_view(), name="customer-reward-detail"),
    path("<uuid:progress_id>/generate-redemption-code/", GenerateRedemptionCodeView.as_view(), name="customer-reward-generate-redemption"),
    path("<uuid:progress_id>/redeem-request/", GenerateRedemptionCodeView.as_view(), name="customer-reward-redeem-request"),
]
