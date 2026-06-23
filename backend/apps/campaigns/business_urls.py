from django.urls import path

from apps.campaigns.views.business_views import (
    CampaignAnalyticsView,
    CampaignCancelView,
    CampaignDetailView,
    CampaignDuplicateView,
    CampaignEndView,
    CampaignListCreateView,
    CampaignParticipantsView,
    CampaignPauseView,
    CampaignPublishView,
    CampaignResumeView,
    CampaignVoucherCancelView,
    CampaignVouchersView,
)

# Mounted at /api/business/campaigns/ (see config/urls.py). Route order mirrors
# plan §1.3 — the static `vouchers/<id>/cancel/` path is declared before the
# `<uuid:campaign_id>/...` patterns so it is not shadowed by the detail route.
urlpatterns = [
    path("", CampaignListCreateView.as_view(), name="business-campaigns"),
    path(
        "vouchers/<uuid:voucher_id>/cancel/",
        CampaignVoucherCancelView.as_view(),
        name="business-campaign-voucher-cancel",
    ),
    path("<uuid:campaign_id>/", CampaignDetailView.as_view(), name="business-campaign-detail"),
    path("<uuid:campaign_id>/publish/", CampaignPublishView.as_view(), name="business-campaign-publish"),
    path("<uuid:campaign_id>/pause/", CampaignPauseView.as_view(), name="business-campaign-pause"),
    path("<uuid:campaign_id>/resume/", CampaignResumeView.as_view(), name="business-campaign-resume"),
    path("<uuid:campaign_id>/end/", CampaignEndView.as_view(), name="business-campaign-end"),
    path("<uuid:campaign_id>/cancel/", CampaignCancelView.as_view(), name="business-campaign-cancel"),
    path("<uuid:campaign_id>/duplicate/", CampaignDuplicateView.as_view(), name="business-campaign-duplicate"),
    path(
        "<uuid:campaign_id>/participants/",
        CampaignParticipantsView.as_view(),
        name="business-campaign-participants",
    ),
    path("<uuid:campaign_id>/vouchers/", CampaignVouchersView.as_view(), name="business-campaign-vouchers"),
    path("<uuid:campaign_id>/analytics/", CampaignAnalyticsView.as_view(), name="business-campaign-analytics"),
]
