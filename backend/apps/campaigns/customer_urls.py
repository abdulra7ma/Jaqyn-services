from django.urls import path

from apps.campaigns.views.customer_views import (
    CampaignCustomerDetailView,
    CampaignDiscoverView,
    CampaignJoinView,
    CampaignVoucherDetailView,
    CampaignVoucherPresentView,
    CampaignWalletView,
    GroupSessionDetailView,
    GroupSessionInviteView,
    GroupSessionStartView,
)

# Mounted at /api/customer/ (see config/urls.py). Mirrors plan §1.3 customer
# routes. The campaign-wallet / campaign-vouchers paths are sibling to the
# campaigns collection so a voucher id never collides with a campaign id.
urlpatterns = [
    path("campaigns/", CampaignDiscoverView.as_view(), name="customer-campaigns"),
    path("campaigns/<uuid:campaign_id>/", CampaignCustomerDetailView.as_view(), name="customer-campaign-detail"),
    path("campaigns/<uuid:campaign_id>/join/", CampaignJoinView.as_view(), name="customer-campaign-join"),
    path("campaigns/<uuid:campaign_id>/group/start/", GroupSessionStartView.as_view(), name="customer-campaign-group-start"),
    path("campaign-groups/<uuid:group_session_id>/", GroupSessionDetailView.as_view(), name="customer-campaign-group-detail"),
    path("campaign-groups/<uuid:group_session_id>/invite/", GroupSessionInviteView.as_view(), name="customer-campaign-group-invite"),
    path("campaign-wallet/", CampaignWalletView.as_view(), name="customer-campaign-wallet"),
    path("campaign-vouchers/<uuid:voucher_id>/", CampaignVoucherDetailView.as_view(), name="customer-campaign-voucher"),
    path(
        "campaign-vouchers/<uuid:voucher_id>/present/",
        CampaignVoucherPresentView.as_view(),
        name="customer-campaign-voucher-present",
    ),
]
