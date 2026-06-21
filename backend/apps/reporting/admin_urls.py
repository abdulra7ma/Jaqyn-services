from django.urls import path

from apps.reporting.views import (
    AdminBlockUserView,
    AdminDisableQRTokenView,
    AdminGroupCompleteView,
    AdminGroupFailView,
    AdminManualAdjustmentView,
    AdminMetricsView,
    AdminScanLogsView,
)

urlpatterns = [
    path("metrics/", AdminMetricsView.as_view(), name="admin-metrics"),
    path("manual-adjustment/", AdminManualAdjustmentView.as_view(), name="admin-manual-adjustment"),
    path("users/<uuid:user_id>/block/", AdminBlockUserView.as_view(), name="admin-user-block"),
    path("qr-tokens/<uuid:token_id>/disable/", AdminDisableQRTokenView.as_view(), name="admin-qr-token-disable"),
    path("groups/<uuid:group_id>/fail/", AdminGroupFailView.as_view(), name="admin-group-fail"),
    path("groups/<uuid:group_id>/complete/", AdminGroupCompleteView.as_view(), name="admin-group-complete"),
    path("scan-logs/", AdminScanLogsView.as_view(), name="admin-scan-logs"),
]
