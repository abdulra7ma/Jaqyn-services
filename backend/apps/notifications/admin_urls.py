from django.urls import path

from apps.notifications.views import AdminNotificationLogsView

urlpatterns = [
    path("notification-logs/", AdminNotificationLogsView.as_view(), name="admin-notification-logs"),
]
