from django.urls import path

from apps.groups.views import (
    ActivateGroupOfferView,
    BusinessGroupDealListView,
    BusinessGroupOfferDetailView,
    BusinessGroupOfferListCreateView,
    PauseGroupOfferView,
    SubmitGroupOfferView,
)

urlpatterns = [
    path("group-deals/", BusinessGroupDealListView.as_view(), name="business-group-deals"),
    path("group-offers/", BusinessGroupOfferListCreateView.as_view(), name="business-group-offers"),
    path("group-offers/<uuid:offer_id>/", BusinessGroupOfferDetailView.as_view(), name="business-group-offer-detail"),
    path("group-offers/<uuid:offer_id>/submit-for-approval/", SubmitGroupOfferView.as_view(), name="business-group-offer-submit"),
    path("group-offers/<uuid:offer_id>/pause/", PauseGroupOfferView.as_view(), name="business-group-offer-pause"),
    path("group-offers/<uuid:offer_id>/activate/", ActivateGroupOfferView.as_view(), name="business-group-offer-activate"),
]
