from django.urls import path

from apps.businesses.views import PublicBusinessDetailView, PublicBusinessListView

urlpatterns = [
    path("nearby/", PublicBusinessListView.as_view(), name="public-business-nearby"),
    path("<uuid:business_id>/", PublicBusinessDetailView.as_view(), name="public-business-detail"),
]
