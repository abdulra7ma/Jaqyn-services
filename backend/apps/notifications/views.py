from rest_framework.views import APIView

from apps.notifications.models import NotificationLog, NotificationPreference
from apps.notifications.serializers import NotificationLogSerializer, NotificationPreferenceSerializer
from core.permissions import IsAdmin
from core.response import success_response


class NotificationPreferenceView(APIView):
    def get(self, request):
        preferences, _ = NotificationPreference.objects.get_or_create(user=request.user)
        return success_response(NotificationPreferenceSerializer(preferences).data)

    def patch(self, request):
        preferences, _ = NotificationPreference.objects.get_or_create(user=request.user)
        serializer = NotificationPreferenceSerializer(preferences, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(NotificationPreferenceSerializer(preferences).data)


class AdminNotificationLogsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        logs = NotificationLog.objects.select_related("recipient").order_by("-created_at")[:100]
        return success_response({"results": NotificationLogSerializer(logs, many=True).data})
