from rest_framework.views import APIView

from apps.notifications.models import NotificationLog, NotificationPreference
from apps.notifications.serializers import (
    CampaignNoticeSerializer,
    MarkCampaignNoticesSeenSerializer,
    NotificationLogSerializer,
    NotificationPreferenceSerializer,
)
from apps.notifications.services import CampaignNoticeService
from core.pagination import StandardResultsSetPagination
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
    """Paginated list of all notification logs for admin inspection.

    Replaces the former hand-capped ``[:100]`` slice with project-standard
    page-number pagination (default 25, hard max 100 via ``?page_size``).
    """

    permission_classes = [IsAdmin]
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        logs = NotificationLog.objects.select_related("recipient").order_by(
            "-created_at"
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(logs, request, view=self)
        return paginator.get_paginated_response(
            NotificationLogSerializer(page, many=True).data
        )


class CustomerCampaignNoticesView(APIView):
    """List relevant unread campaign notices and acknowledge viewed rows.

    The GET returns project-standard page-number pagination (default 25, hard
    max 100 via ``?page_size``). In practice a customer never has more than a
    handful of notices, but pagination enforces the contract that no list
    endpoint is unbounded.
    """

    permission_classes = [IsCustomer]
    serializer_class = CampaignNoticeSerializer
    pagination_class = StandardResultsSetPagination
    throttle_scope = "notification_write"

    def get(self, request):
        notices = CampaignNoticeService.unread_for_customer(request.user)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(notices, request, view=self)
        return paginator.get_paginated_response(
            self.serializer_class(page, many=True).data
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
