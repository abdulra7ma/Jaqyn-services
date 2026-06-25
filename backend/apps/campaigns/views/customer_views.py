"""Customer campaign views (plan §1.3).

Discover, detail (with my-progress), join, the campaign wallet, a single voucher
QR view, and the present ("waiting for staff") action. Group session start / join /
read / invite are the real MVP group runtime (plan D7/Q4/Q6): the leader starts a
session, members join via the invite token, and the staff confirm step issues the
single leader voucher. Views hold zero logic.
"""

from __future__ import annotations

from rest_framework.views import APIView

from apps.campaigns.serializers import (
    CampaignDetailSerializer,
    CampaignDiscoverQuerySerializer,
    CampaignProgressSerializer,
    CampaignRewardVoucherSerializer,
    CampaignSerializer,
    GroupSessionSerializer,
)
from apps.campaigns.services import (
    CampaignGroupService,
    CampaignProgressService,
    CampaignRewardService,
    CampaignService,
)
from core.frontend import frontend_base_url
from core.pagination import StandardResultsSetPagination
from core.permissions import IsCustomer
from core.response import success_response


class CampaignDiscoverView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = CampaignSerializer
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        # Shape validation of the optional query params lives in the serializer;
        # the view passes the validated values to the service, which owns the
        # filtering rules. Unknown ``type`` values are ignored gracefully there.
        params = CampaignDiscoverQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        campaigns = CampaignService.discover_for_customer(
            request.user,
            campaign_type=params.validated_data.get("type"),
            joined_only=params.validated_data.get("joined", False),
        )
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(campaigns, request, view=self)
        # Prefetch this page's per-customer progress so my_progress on each row
        # resolves from memory (no N+1) — see CampaignService.progress_context_for.
        progress_context = CampaignService.progress_context_for(request.user, page)
        return paginator.get_paginated_response(
            CampaignSerializer(
                page, many=True, context={"progress_context": progress_context}
            ).data
        )


class CampaignCustomerDetailView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = CampaignDetailSerializer

    def get(self, request, campaign_id):
        campaign = CampaignService.get_discoverable(campaign_id)
        participant = CampaignService.participant_for(campaign, request.user)
        return success_response(
            CampaignDetailSerializer(
                campaign, context={"participant": participant}
            ).data
        )


class CampaignJoinView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = CampaignProgressSerializer
    throttle_scope = "campaign_join"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    def post(self, request, campaign_id):
        campaign = CampaignService.get_discoverable(campaign_id)
        participant = CampaignProgressService.join_campaign(campaign, request.user)
        return success_response(
            CampaignProgressSerializer(participant).data, status=201
        )


class CampaignWalletView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = CampaignRewardVoucherSerializer
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        vouchers = CampaignRewardService.wallet_for_customer(request.user)
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(vouchers, request, view=self)
        return paginator.get_paginated_response(
            CampaignRewardVoucherSerializer(
                page, many=True, context={"request": request}
            ).data
        )


class CampaignVoucherDetailView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = CampaignRewardVoucherSerializer

    def get(self, request, voucher_id):
        voucher = CampaignRewardService.get_customer_voucher(voucher_id, request.user)
        return success_response(
            CampaignRewardVoucherSerializer(
                voucher, context={"request": request}
            ).data
        )


class CampaignVoucherPresentView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = CampaignRewardVoucherSerializer
    throttle_scope = "campaign_present"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    def post(self, request, voucher_id):
        voucher = CampaignRewardService.present_voucher(voucher_id, request.user)
        return success_response(
            CampaignRewardVoucherSerializer(
                voucher, context={"request": request}
            ).data
        )


# --- Group session (MVP runtime, plan D7/Q4/Q6) -----------------------------
# The real group loop: a leader starts a session, members join via the invite
# token, and the staff confirm step (see staff_views) issues the single leader
# voucher. Views parse → call CampaignGroupService → shape the response.


def _invite_url(request, session) -> str:
    """Build the scannable invite URL for a group session's GROUP_INVITE token."""
    return f"{frontend_base_url(request)}/q/{session.invite_token}"


class GroupSessionStartView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = GroupSessionSerializer
    throttle_scope = "campaign_join"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    def post(self, request, campaign_id):
        campaign = CampaignService.get_discoverable(campaign_id)
        session = CampaignGroupService.start_group_session(campaign, request.user)
        return success_response(
            GroupSessionSerializer(session).data, status=201
        )


class GroupSessionDetailView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = GroupSessionSerializer

    def get(self, request, group_session_id):
        session = CampaignGroupService.get_session_for_customer(
            group_session_id, request.user
        )
        return success_response(GroupSessionSerializer(session).data)


class GroupSessionInviteView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = GroupSessionSerializer
    throttle_scope = "campaign_join"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    def post(self, request, group_session_id):
        session = CampaignGroupService.invite_link_for_session(
            group_session_id, request.user
        )
        data = dict(GroupSessionSerializer(session).data)
        data["invite_url"] = _invite_url(request, session)
        return success_response(data)
