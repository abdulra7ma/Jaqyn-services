from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404

from apps.businesses.models import Business
from apps.businesses.serializers import BusinessSerializer
from apps.campaigns.models import Campaign, Group
from apps.campaigns.serializers import CampaignProgressSerializer, GroupSerializer
from apps.qr.models import QRCodeToken
from apps.reporting.business_reports import build_business_report, resolve_period
from apps.reporting.services import admin_metrics, business_customers
from apps.reporting.serializers import (
    AdminReasonSerializer,
    BusinessReportSerializer,
    ManualAdjustmentSerializer,
    ReportQuerySerializer,
)
from apps.reporting.services import (
    block_user,
    disable_business_and_tokens,
    disable_qr_token,
    manual_adjustment,
    mark_group_completed,
    mark_group_failed,
    suspicious_scan_rows,
)
from core.permissions import IsAdmin, IsBusinessOwner
from core.response import success_response


class BusinessReportsView(APIView):
    permission_classes = [IsBusinessOwner]
    serializer_class = BusinessReportSerializer

    def get(self, request):
        query = ReportQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        window = resolve_period(
            query.validated_data["period"],
            query.validated_data.get("date_from"),
            query.validated_data.get("date_to"),
        )
        report = build_business_report(request.user.owned_business, window)
        return success_response(BusinessReportSerializer(report).data)


class BusinessCustomersView(APIView):
    permission_classes = [IsBusinessOwner]

    def get(self, request):
        return success_response({"results": business_customers(request.user.owned_business)})


class AdminMetricsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        return success_response(admin_metrics())


class AdminManualAdjustmentView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        serializer = ManualAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        User = get_user_model()
        customer = get_object_or_404(User, id=serializer.validated_data["customer"])
        campaign = get_object_or_404(
            Campaign.objects.select_related("rule"),
            id=serializer.validated_data["program"],
        )
        participant, _action = manual_adjustment(
            request.user,
            customer,
            campaign,
            serializer.validated_data["amount_count"],
            serializer.validated_data["reason"],
        )
        return success_response(CampaignProgressSerializer(participant).data)


class AdminBlockUserView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        serializer = AdminReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = block_user(get_object_or_404(get_user_model(), id=user_id), request.user, serializer.validated_data.get("reason"))
        return success_response({"id": str(user.id), "is_active": user.is_active})


class AdminDisableBusinessView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, business_id):
        serializer = AdminReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = disable_business_and_tokens(get_object_or_404(Business, id=business_id), request.user, serializer.validated_data.get("reason"))
        return success_response(BusinessSerializer(business).data)


class AdminDisableQRTokenView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, token_id):
        serializer = AdminReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = disable_qr_token(get_object_or_404(QRCodeToken, id=token_id), request.user, serializer.validated_data.get("reason"))
        return success_response({"id": str(token.id), "is_active": token.is_active})


class AdminGroupFailView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, group_id):
        serializer = AdminReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        group = mark_group_failed(get_object_or_404(Group, id=group_id), request.user, serializer.validated_data.get("reason"))
        return success_response(GroupSerializer(group).data)


class AdminGroupCompleteView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, group_id):
        serializer = AdminReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        group = mark_group_completed(get_object_or_404(Group, id=group_id), request.user, serializer.validated_data.get("reason"))
        return success_response(GroupSerializer(group).data)


class AdminScanLogsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        rows = [
            {
                "customer": str(row["customer"]) if row["customer"] else None,
                "business": str(row["business"]) if row["business"] else None,
                "failure_reason": row["failure_reason"],
                "total": row["total"],
            }
            for row in suspicious_scan_rows()
        ]
        return success_response({"suspicious": rows})
