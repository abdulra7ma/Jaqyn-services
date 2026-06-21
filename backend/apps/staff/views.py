from rest_framework.views import APIView

from apps.loyalty.models import RewardProgram, RewardRedemption
from apps.loyalty.serializers import RewardRedemptionSerializer
from apps.loyalty.services import get_staff_for_user, staff_collect
from apps.qr.models import QRCodeToken, ScanLog
from apps.qr.services import resolve_qr_token
from apps.staff.serializers import StaffCollectSerializer, StaffScanSerializer
from core.exceptions import JaqynAPIException
from core.permissions import IsStaff
from core.response import success_response


def token_business(token):
    if token.business:
        return token.business
    if token.reward_redemption:
        return token.reward_redemption.business
    if token.group_deal:
        return token.group_deal.group_offer.business
    return None


class StaffScanView(APIView):
    permission_classes = [IsStaff]

    def post(self, request):
        serializer = StaffScanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = get_staff_for_user(request.user)
        token = resolve_qr_token(serializer.validated_data["token"], request, action="staff_scan")
        business = token_business(token)
        if business and business.id != staff.business_id:
            raise JaqynAPIException("WRONG_BUSINESS", status_code=403)

        payload = {"type": token.type, "business": str(business.id) if business else None}
        if token.type == QRCodeToken.Type.REWARD_REDEEM and token.reward_redemption:
            payload["redemption"] = RewardRedemptionSerializer(token.reward_redemption).data
        if token.type in {QRCodeToken.Type.GROUP_INVITE, QRCodeToken.Type.GROUP_CHECKIN, QRCodeToken.Type.GROUP_REWARD} and token.group_deal:
            payload["group"] = str(token.group_deal_id)
        return success_response(payload)


class StaffCollectView(APIView):
    permission_classes = [IsStaff]

    def post(self, request):
        serializer = StaffCollectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = get_staff_for_user(request.user)
        result = staff_collect(
            staff=staff,
            raw_token=serializer.validated_data["token"],
            amount=serializer.validated_data.get("amount"),
            program_id=serializer.validated_data.get("program_id"),
            request=request,
        )
        return success_response(result)


class StaffProgramsView(APIView):
    permission_classes = [IsStaff]

    def get(self, request):
        staff = get_staff_for_user(request.user)
        programs = RewardProgram.objects.filter(
            business=staff.business,
            is_active=True,
        ).order_by("-created_at")
        return success_response({
            "programs": [
                {
                    "id": str(p.id),
                    "type": p.type,
                    "title": p.title,
                    "required_count": p.required_count,
                    "required_spend": str(p.required_spend) if p.required_spend is not None else None,
                    "reward_description": p.reward_description,
                }
                for p in programs
            ]
        })


class StaffRecentActivityView(APIView):
    permission_classes = [IsStaff]

    def get(self, request):
        staff = get_staff_for_user(request.user)
        scans = ScanLog.objects.filter(business=staff.business).order_by("-created_at")[:20]
        redemptions = RewardRedemption.objects.filter(business=staff.business).order_by("-created_at")[:20]
        return success_response({
            "scans": [
                {
                    "id": str(scan.id),
                    "action": scan.action,
                    "status": scan.status,
                    "failure_reason": scan.failure_reason,
                    "created_at": scan.created_at,
                }
                for scan in scans
            ],
            "redemptions": [
                {
                    "id": str(redemption.id),
                    "code": redemption.code,
                    "status": redemption.status,
                    "created_at": redemption.created_at,
                }
                for redemption in redemptions
            ],
        })
