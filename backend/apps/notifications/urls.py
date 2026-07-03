from django.urls import path

from apps.notifications.views import (
    CustomerCampaignNoticesView,
    NotificationPreferenceView,
)

urlpatterns = [
    path(
        "notifications/preferences/",
        NotificationPreferenceView.as_view(),
        name="notification-preferences",
    ),
    path(
        "notifications/campaign-notices/",
        CustomerCampaignNoticesView.as_view(),
        name="customer-campaign-notices",
    ),
]
