from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.campaigns.serializers import CampaignRewardVoucherSerializer
from apps.loyalty.scan import UnifiedStaffScanService
from apps.loyalty.serializers import LoyaltyVoucherSerializer, ScanSerializer
from apps.staff.services import get_staff_for_user
from core.permissions import IsStaff
from core.response import success_response


class UnifiedStaffScanView(APIView):
    permission_classes = [IsStaff]
    serializer_class = ScanSerializer
    throttle_scope = "loyalty_scan"

    def get_throttles(self):
        return [ScopedRateThrottle()]

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = UnifiedStaffScanService.resolve(
            get_staff_for_user(request.user),
            serializer.validated_data["token"],
            request,
        )
        if result.kind == "customer":
            campaigns = [
                {
                    "campaign_id": str(row.campaign.id),
                    "name": row.campaign.name,
                    "eligible": row.eligible,
                    "reason_code": row.reason_code,
                    "progress_count": row.progress_count,
                    "required_count": row.required_count,
                    "mechanic": "visit",
                }
                for row in result.campaigns or []
            ]
            loyalty = [row.__dict__ for row in result.loyalty or []]
            customer = result.customer
            phone = getattr(customer, "phone", None) or ""
            return success_response(
                {
                    "kind": "customer",
                    "customer": {
                        "name": getattr(customer, "name", None) or "Customer",
                        "phone_masked": f"***{phone[-4:]}" if phone else "",
                    },
                    "loyalty": loyalty,
                    "campaigns": campaigns,
                }
            )
        if result.kind == "voucher":
            voucher = (
                LoyaltyVoucherSerializer(result.voucher).data
                if result.domain == "loyalty" and result.voucher
                else CampaignRewardVoucherSerializer(result.voucher).data
                if result.voucher
                else None
            )
            return success_response(
                {"kind": "voucher", "domain": result.domain, "voucher": voucher}
            )
        if result.kind == "group":
            return success_response(
                {
                    "kind": "group",
                    "group_id": str(result.group.id) if result.group else None,
                }
            )
        return success_response({"kind": "invalid", "reason_code": result.reason_code})
