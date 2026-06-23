"""Campaign-aware staff scanner views (plan §1.3).

Resolve a customer QR to eligible campaigns, confirm a visit against a chosen
campaign, resolve a reward voucher, redeem it, and (Phase 2 seam) confirm a group
check-in. Views hold zero logic: parse → call
:class:`apps.campaigns.services.StaffScannerService` → shape the response. Every
scan is audited inside the service via ``apps.qr.ScanLog``.
"""

from __future__ import annotations

from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.campaigns.serializers import (
    CampaignRewardVoucherSerializer,
    ConfirmGroupSerializer,
    ConfirmVisitSerializer,
    CustomerScanResultSerializer,
    GroupConfirmResultSerializer,
    ProgressResultSerializer,
    ScanCustomerSerializer,
    ScanVoucherSerializer,
)
from apps.campaigns.services import StaffScannerService
from apps.loyalty.services import get_staff_for_user
from core.permissions import IsStaff
from core.response import success_response


class _StaffScanView(APIView):
    """Base for the staff write endpoints — all rate-limited on one scope."""

    permission_classes = [IsStaff]
    throttle_scope = "campaign_scan"

    def get_throttles(self):
        return [ScopedRateThrottle()]


class ScanCustomerView(_StaffScanView):
    serializer_class = ScanCustomerSerializer

    def post(self, request):
        serializer = ScanCustomerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = get_staff_for_user(request.user)
        result = StaffScannerService.scan_customer_qr(
            staff, serializer.validated_data["token"], request=request
        )
        return success_response(
            CustomerScanResultSerializer(result).data
        )


class ConfirmVisitView(_StaffScanView):
    serializer_class = ConfirmVisitSerializer

    def post(self, request):
        serializer = ConfirmVisitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = get_staff_for_user(request.user)
        result = StaffScannerService.confirm_visit_for_token(
            staff,
            serializer.validated_data["campaign_id"],
            serializer.validated_data["token"],
            request=request,
        )
        return success_response(
            ProgressResultSerializer(result, context={"request": request}).data
        )


class ScanVoucherView(_StaffScanView):
    serializer_class = ScanVoucherSerializer

    def post(self, request):
        serializer = ScanVoucherSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = get_staff_for_user(request.user)
        voucher = StaffScannerService.scan_reward_qr(
            staff,
            token=serializer.validated_data.get("token"),
            code=serializer.validated_data.get("code"),
            request=request,
        )
        return success_response(
            CampaignRewardVoucherSerializer(voucher, context={"request": request}).data
        )


class RedeemVoucherView(_StaffScanView):
    serializer_class = ScanVoucherSerializer

    def post(self, request):
        serializer = ScanVoucherSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = get_staff_for_user(request.user)
        from apps.campaigns.services import CampaignRewardService

        voucher = CampaignRewardService.redeem_reward_voucher(
            staff,
            token=serializer.validated_data.get("token"),
            code=serializer.validated_data.get("code"),
            request=request,
        )
        return success_response(
            CampaignRewardVoucherSerializer(voucher, context={"request": request}).data
        )


class ConfirmGroupView(_StaffScanView):
    """Confirm a group check-in and issue the single leader voucher (§11 / Q4).

    Delegates to ``StaffScannerService.confirm_group_visit``, which validates the
    group reached its required size within the check-in window, marks the session
    COMPLETED, and mints one voucher for the leader.
    """

    serializer_class = ConfirmGroupSerializer

    def post(self, request):
        serializer = ConfirmGroupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = get_staff_for_user(request.user)
        result = StaffScannerService.confirm_group_visit(
            staff, serializer.validated_data["group_session_id"], request=request
        )
        return success_response(
            GroupConfirmResultSerializer(result, context={"request": request}).data
        )
