"""Legacy staff till views (post campaigns-restructure).

The customer-identify / award / recent-activity surface for the staff till. The
loyalty and groups apps were deleted in the campaigns restructure, so these views
are now backed by the unified campaigns scanner and campaign vouchers. The full
scan→advance→redeem flow lives in ``apps.campaigns`` under
``/api/staff/campaigns/``; what remains here is the lightweight resolve/list
surface the staff till still calls.
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.campaigns.models import Campaign, CampaignRewardVoucher
from apps.qr.models import QRCodeToken
from apps.qr.services import resolve_qr_token
from apps.staff.serializers import (
    ActivityEventSerializer,
    ActivityQuerySerializer,
    StaffProfileCompleteSerializer,
    StaffScanSerializer,
    StaffTodayStatsSerializer,
)
from apps.staff.services import (
    get_staff_for_user,
    get_staff_today_stats,
    list_activity_events,
)
from apps.staff.services import management
from core.exceptions import JaqynAPIException
from core.pagination import StandardResultsSetPagination
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


class StaffStatsView(APIView):
    """Today's scan + redemption counters for the staff member's business.

    Feeds the two stat tiles on the staff Profile/Activity screens (handoff
    plan §B1). Zero logic here — the service owns the "today" semantics.
    """

    permission_classes = [IsStaff]
    serializer_class = StaffTodayStatsSerializer

    def get(self, request):
        staff = get_staff_for_user(request.user)
        stats = get_staff_today_stats(staff.business)
        return success_response(StaffTodayStatsSerializer(stats).data)


class StaffRecentActivityView(APIView):
    """Unified, paginated activity feed at the staff member's business.

    One ``events`` list (redeem / stamp / visit / points / social — see
    ``apps.staff.services.activity`` for the source mapping), optionally
    filtered by ``?kind=`` and paginated with the project-standard page-number
    pagination (default 25, hard max 100 via ``page_size``).
    """

    permission_classes = [IsStaff]
    serializer_class = ActivityEventSerializer
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        query = ActivityQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        staff = get_staff_for_user(request.user)
        events = list_activity_events(
            staff.business, kind=query.validated_data.get("kind")
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(events, request, view=self)
        return paginator.get_paginated_response(
            ActivityEventSerializer(page, many=True).data
        )


class StaffProfileCompleteView(APIView):
    """Staff member's first-login profile completion: name + own password.

    Requires only IsAuthenticated (not IsStaff) so the freshly created account
    can call this before profile_completed is True. The service enforces that the
    caller has an active staff membership via get_staff_for_user.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = StaffProfileCompleteSerializer

    def post(self, request):
        serializer = StaffProfileCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        management.complete_staff_profile(
            request.user,
            serializer.validated_data["name"],
            serializer.validated_data["new_password"],
        )
        return success_response({"profile_completed": True})
