from rest_framework.views import APIView

from apps.notifications.models import NotificationLog, NotificationPreference
from apps.notifications.serializers import (
    CampaignNoticeSerializer,
    MarkCampaignNoticesSeenSerializer,
    NotificationLogSerializer,
    NotificationPreferenceSerializer,
)
from apps.notifications.services import CampaignNoticeService
from core.permissions import IsAdmin, IsCustomer
from core.response import success_response


class NotificationPreferenceView(APIView):
    def get(self, request):
        preferences, _ = NotificationPreference.objects.get_or_create(user=request.user)
        return success_response(NotificationPreferenceSerializer(preferences).data)

    def patch(self, request):
        preferences, _ = NotificationPreference.objects.get_or_create(user=request.user)
        serializer = NotificationPreferenceSerializer(
            preferences, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(NotificationPreferenceSerializer(preferences).data)


class AdminNotificationLogsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        logs = NotificationLog.objects.select_related("recipient").order_by(
            "-created_at"
        )[:100]
        return success_response(
            {"results": NotificationLogSerializer(logs, many=True).data}
        )


class CustomerCampaignNoticesView(APIView):
    """List relevant unread campaign notices and acknowledge viewed rows."""

    permission_classes = [IsCustomer]
    serializer_class = CampaignNoticeSerializer
    throttle_scope = "notification_write"

    def get(self, request):
        notices = CampaignNoticeService.unread_for_customer(request.user)
        return success_response(
            {"results": self.serializer_class(notices, many=True).data}
        )

    def post(self, request):
        serializer = MarkCampaignNoticesSeenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = CampaignNoticeService.mark_seen(
            request.user, serializer.validated_data["ids"]
        )
        return success_response({"seen": updated})

    def get_throttles(self):
        if self.request.method == "POST":
            from rest_framework.throttling import ScopedRateThrottle

            return [ScopedRateThrottle()]
        return super().get_throttles()
