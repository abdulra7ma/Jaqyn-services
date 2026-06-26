"""Legacy staff till views (post campaigns-restructure).

The customer-identify / award / recent-activity surface for the staff till. The
loyalty and groups apps were deleted in the campaigns restructure, so these views
are now backed by the unified campaigns scanner and campaign vouchers. The full
scan→advance→redeem flow lives in ``apps.campaigns`` under
``/api/staff/campaigns/``; what remains here is the lightweight resolve/list
surface the staff till still calls.
"""

from rest_framework.views import APIView

from apps.campaigns.models import Campaign, CampaignRewardVoucher
from apps.qr.models import QRCodeToken, ScanLog
from apps.qr.services import resolve_qr_token
from apps.staff.serializers import StaffScanSerializer
from apps.staff.services import get_staff_for_user
from core.exceptions import JaqynAPIException
from core.permissions import IsStaff
from core.response import success_response


def token_business(token):
    """Resolve the owning business of a scanned token, or ``None``.

    A campaign voucher token carries no direct business FK, so it is matched
    through the ``CampaignRewardVoucher`` it points at.
    """
    if token.business:
        return token.business
    if token.type == QRCodeToken.Type.CAMPAIGN_REWARD:
        voucher = (
            CampaignRewardVoucher.objects.select_related("business")
            .filter(qr_token=token)
            .first()
        )
        if voucher is not None:
            return voucher.business
    return None


class StaffScanView(APIView):
    """Resolve a scanned token to its type + owning business (read-only).

    The award/redeem flow is the campaigns unified scanner
    (``/api/staff/campaigns/``); this stays as a lightweight resolve so the till
    can label a scan. A campaign-reward token surfaces its voucher id.
    """

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
        if token.type == QRCodeToken.Type.CAMPAIGN_REWARD:
            voucher = (
                CampaignRewardVoucher.objects.filter(qr_token=token).first()
            )
            if voucher is not None:
                payload["voucher"] = str(voucher.id)
        return success_response(payload)


class StaffProgramsView(APIView):
    """List a business's ACTIVE campaigns for the staff till program picker.

    Post-restructure a loyalty program is an INDIVIDUAL campaign, so this lists
    ACTIVE campaigns with their rule summary.
    """

    permission_classes = [IsStaff]

    def get(self, request):
        staff = get_staff_for_user(request.user)
        campaigns = (
            Campaign.objects.filter(
                business=staff.business, status=Campaign.Status.ACTIVE
            )
            .select_related("rule", "reward")
            .order_by("-created_at")
        )
        return success_response({
            "programs": [
                {
                    "id": str(c.id),
                    "type": c.campaign_type,
                    "mechanic": getattr(getattr(c, "rule", None), "mechanic", None),
                    "title": c.name,
                    "required_count": getattr(getattr(c, "rule", None), "required_count", None),
                    "required_spend": (
                        str(c.rule.required_spend)
                        if getattr(c, "rule", None) is not None and c.rule.required_spend is not None
                        else None
                    ),
                    "reward_description": getattr(getattr(c, "reward", None), "description", ""),
                }
                for c in campaigns
            ]
        })


class StaffRecentActivityView(APIView):
    """Recent scans + voucher redemptions at the staff member's business."""

    permission_classes = [IsStaff]

    def get(self, request):
        staff = get_staff_for_user(request.user)
        scans = ScanLog.objects.filter(business=staff.business).order_by("-created_at")[:20]
        redemptions = (
            CampaignRewardVoucher.objects.filter(
                business=staff.business,
                status=CampaignRewardVoucher.Status.REDEEMED,
            )
            .order_by("-redeemed_at")[:20]
        )
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
                    "id": str(voucher.id),
                    "code": voucher.voucher_code,
                    "status": voucher.status,
                    "created_at": voucher.redeemed_at or voucher.created_at,
                }
                for voucher in redemptions
            ],
        })
