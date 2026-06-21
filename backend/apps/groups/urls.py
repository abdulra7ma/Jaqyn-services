from django.urls import path

from apps.groups.views import (
    CustomerGroupsView,
    GroupCancelView,
    GroupCheckInView,
    GroupCreateView,
    GroupInviteView,
    GroupJoinView,
    GroupLeaveView,
    PublicGroupOfferDetailView,
    PublicGroupOfferListView,
)

urlpatterns = [
    path("group-offers/", PublicGroupOfferListView.as_view(), name="group-offers"),
    path("group-offers/<uuid:offer_id>/", PublicGroupOfferDetailView.as_view(), name="group-offer-detail"),
    path("groups/", GroupCreateView.as_view(), name="groups-create"),
    path("groups/<str:invite_token>/", GroupInviteView.as_view(), name="groups-invite"),
    path("groups/<uuid:group_id>/join/", GroupJoinView.as_view(), name="groups-join"),
    path("groups/<uuid:group_id>/leave/", GroupLeaveView.as_view(), name="groups-leave"),
    path("groups/<uuid:group_id>/cancel/", GroupCancelView.as_view(), name="groups-cancel"),
    path("groups/<uuid:group_id>/check-in/", GroupCheckInView.as_view(), name="groups-check-in"),
    path("customer/groups/", CustomerGroupsView.as_view(), name="customer-groups"),
]
