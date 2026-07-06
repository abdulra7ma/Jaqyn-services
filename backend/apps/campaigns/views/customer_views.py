"""Customer campaign views (plan §1.3).

Discover, detail (with my-progress), join, the campaign wallet, a single voucher
QR view, and the present ("waiting for staff") action. Group session start / join /
read / invite are the real MVP group runtime (plan D7/Q4/Q6): the leader starts a
session, members join via the invite token, and the staff confirm step issues the
single leader voucher. Views hold zero logic.
"""

from __future__ import annotations

from django.conf import settings
from rest_framework.views import APIView

from apps.businesses.serializers import CatalogItemSerializer
from apps.campaigns.serializers import (
    CampaignDetailSerializer,
    CampaignDiscoverQuerySerializer,
    CampaignFeedQuerySerializer,
    CampaignProgressSerializer,
    CampaignRewardVoucherSerializer,
    CampaignSerializer,
    GroupSerializer,
    GroupSessionStartSerializer,
    SelectVoucherItemSerializer,
)
from core.exceptions import JaqynAPIException
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


class CampaignFeedView(APIView):
    """The customer campaigns feed: ``{followed, discover, sections}`` (spec §B).

    ``followed`` is the customer's in-progress campaigns ("From places you go"
    row); ``discover`` is the discoverable set, filterable via ``?discover=``
    (``all``/``group``/``neighborhood``/``ended``), ``?q=`` (search), and
    ``?category=`` (business category slug). Both lists carry each row's
    ``my_progress`` via a shared prefetched progress context so the whole response
    is N+1-free. ``sections`` carries ``{featured, trending, fresh}`` for the
    Discover screen. Not paginated — the feed is a curated set surfaced together.
    """

    permission_classes = [IsCustomer]
    serializer_class = CampaignSerializer

    def get(self, request):
        params = CampaignFeedQuerySerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        followed, discover, sections = CampaignService.feed_for_customer(
            request.user,
            discover_filter=params.validated_data.get("discover", "all"),
            q=params.validated_data.get("q"),
            category=params.validated_data.get("category"),
        )
        # One progress context over all lists keeps my_progress off the N+1 path.
        all_campaigns = followed + discover + sum(sections.values(), [])
        progress_context = CampaignService.progress_context_for(
            request.user, all_campaigns
        )
        ctx = {"progress_context": progress_context}
        return success_response(
            {
                "followed": CampaignSerializer(followed, many=True, context=ctx).data,
                "discover": CampaignSerializer(discover, many=True, context=ctx).data,
                "sections": {
                    key: CampaignSerializer(clist, many=True, context=ctx).data
                    for key, clist in sections.items()
                },
            }
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
        result = CampaignProgressService.join_campaign_with_wallet(
            campaign, request.user
        )
        data = dict(CampaignProgressSerializer(result.participant).data)
        data["wallet_cards_added"] = result.wallet_cards_added
        return success_response(
            data, status=201
        )


class CampaignVoucherSelectItemView(APIView):
    """POST attach a customer-chosen CatalogItem to a customer-choice item voucher.

    Parses ``{catalog_item_id}``, calls
    :meth:`CampaignRewardService.select_voucher_item` (which enforces ownership,
    the customer-choice gate, and the same-business item check), and returns the
    updated voucher. Throttled on ``campaign_join``. Holds no business logic.
    """

    permission_classes = [IsCustomer]
    serializer_class = SelectVoucherItemSerializer
    throttle_scope = "campaign_join"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    def post(self, request, voucher_id):
        params = SelectVoucherItemSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        voucher = CampaignRewardService.select_voucher_item(
            voucher_id, request.user, params.validated_data["catalog_item_id"]
        )
        return success_response(
            CampaignRewardVoucherSerializer(voucher, context={"request": request}).data
        )


class CampaignCatalogView(APIView):
    """GET the eligible CatalogItems a customer may pick for a campaign's item reward.

    Backs the customer item-selection sheet (multi-form-loyalty design §1). Loads
    the campaign, returns its business's active catalog (paginated) via
    :meth:`CampaignRewardService.eligible_catalog_items`. Holds no business logic.
    """

    permission_classes = [IsCustomer]
    serializer_class = CatalogItemSerializer
    pagination_class = StandardResultsSetPagination

    def get(self, request, campaign_id):
        campaign = CampaignService.get_discoverable(campaign_id)
        items = CampaignRewardService.eligible_catalog_items(campaign)
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(items, request, view=self)
        return paginator.get_paginated_response(
            CatalogItemSerializer(page, many=True).data
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
            CampaignRewardVoucherSerializer(voucher, context={"request": request}).data
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
            CampaignRewardVoucherSerializer(voucher, context={"request": request}).data
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
    serializer_class = GroupSerializer
    throttle_scope = "campaign_join"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    def post(self, request, campaign_id):
        # Shape-validate the optional visit_time / name / note; the service owns
        # the rules (idempotency, persistence). Empty body is a bare start.
        params = GroupSessionStartSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        campaign = CampaignService.get_discoverable(campaign_id)
        session = CampaignGroupService.start_group_session(
            campaign,
            request.user,
            visit_time=params.validated_data.get("visit_time"),
            name=params.validated_data.get("name", ""),
            note=params.validated_data.get("note", ""),
        )
        return success_response(
            GroupSerializer(session, context={"request": request}).data, status=201
        )


class GroupSessionListView(APIView):
    """Paginated list of the customer's active group sessions.

    Returns non-terminal groups the customer leads or actively belongs to,
    newest-first. The frontend reads ``campaign``/``campaign_name`` to render
    the "Your active group" banner and to decide create-vs-forming.
    Default page: 25, hard max: 100 (via ``?page_size``). A customer can only
    be in one active group per campaign, so this list is tiny in practice;
    pagination enforces the contract that no list endpoint is unbounded.
    """

    permission_classes = [IsCustomer]
    serializer_class = GroupSerializer
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        groups = CampaignGroupService.active_groups_for_customer(request.user)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(groups, request, view=self)
        return paginator.get_paginated_response(
            GroupSerializer(page, many=True, context={"request": request}).data
        )


class GroupSessionDetailView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = GroupSerializer

    def get(self, request, group_session_id):
        session = CampaignGroupService.get_session_for_customer(
            group_session_id, request.user
        )
        return success_response(
            GroupSerializer(session, context={"request": request}).data
        )


class GroupSessionInviteView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = GroupSerializer
    throttle_scope = "campaign_join"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    def post(self, request, group_session_id):
        session = CampaignGroupService.invite_link_for_session(
            group_session_id, request.user
        )
        data = dict(GroupSerializer(session, context={"request": request}).data)
        data["invite_url"] = _invite_url(request, session)
        return success_response(data)


class GroupSessionLeaveView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = GroupSerializer
    throttle_scope = "campaign_join"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    def post(self, request, group_session_id):
        CampaignGroupService.leave_group_session(group_session_id, request.user)
        return success_response({"success": True})


class GroupSessionDemoFillView(APIView):
    """DEV-only: simulate friends joining a group so it reaches FULL (demo aid).

    Gated on ``settings.DEBUG``: this auto-joins *other* real customer accounts to
    the leader's group to make the full→check-in flow demonstrable on one device.
    It must never be reachable in production — there it raises ``PERMISSION_DENIED``
    (403) so the route exists but does nothing. The fill itself goes through the
    real join path so the resulting state is identical to genuine joins.
    """

    permission_classes = [IsCustomer]
    serializer_class = GroupSerializer
    throttle_scope = "campaign_join"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    def post(self, request, group_session_id):
        from rest_framework import status as http_status

        if not settings.DEBUG:
            # Demo/testing aid only — never a production capability. Refuse outside
            # DEBUG so the endpoint cannot be abused to stuff groups in prod.
            raise JaqynAPIException(
                "PERMISSION_DENIED",
                "Demo fill is only available in development",
                http_status.HTTP_403_FORBIDDEN,
            )
        session = CampaignGroupService.demo_fill_group(group_session_id, request.user)
        return success_response(
            GroupSerializer(session, context={"request": request}).data
        )
