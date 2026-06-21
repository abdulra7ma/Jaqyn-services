from django.urls import path

from apps.groups.views import AdminApproveGroupOfferView, AdminPauseGroupOfferView, AdminRejectGroupOfferView, PendingGroupOffersView

urlpatterns = [
    path("group-offers/pending/", PendingGroupOffersView.as_view(), name="admin-group-offers-pending"),
    path("group-offers/<uuid:offer_id>/approve/", AdminApproveGroupOfferView.as_view(), name="admin-group-offer-approve"),
    path("group-offers/<uuid:offer_id>/reject/", AdminRejectGroupOfferView.as_view(), name="admin-group-offer-reject"),
    path("group-offers/<uuid:offer_id>/pause/", AdminPauseGroupOfferView.as_view(), name="admin-group-offer-pause"),
]
