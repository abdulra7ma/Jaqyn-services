from django.urls import path

from apps.businesses.views import (
    PublicBusinessCategoriesView,
    PublicBusinessDetailView,
    PublicBusinessListView,
)

urlpatterns = [
    path("nearby/", PublicBusinessListView.as_view(), name="public-business-nearby"),
    path("categories/", PublicBusinessCategoriesView.as_view(), name="public-business-categories"),
    path("<uuid:business_id>/", PublicBusinessDetailView.as_view(), name="public-business-detail"),
]
