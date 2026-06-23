"""Business-owner campaign views (plan §1.3).

Owner/manager CRUD, the status-machine actions, the participant/voucher lists,
and the analytics roll-up. Views hold **zero** business logic: they parse input
with a serializer, call the service, and shape the response with
``core.response.success_response``. Ownership, the state machine, and the publish
gate all live in :class:`apps.campaigns.services.CampaignService`.

Manager-gated actions (voucher cancel) verify ``StaffMember.role`` via the
service, not in the view.
"""

from __future__ import annotations

from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.campaigns.serializers import (
    CampaignImageUploadSerializer,
    CampaignMetricsSerializer,
    CampaignParticipantSerializer,
    CampaignRewardVoucherSerializer,
    CampaignSerializer,
    CampaignWriteSerializer,
    CancelVoucherSerializer,
    SocialPostSerializer,
)
from apps.campaigns.services import (
    CampaignAnalyticsService,
    CampaignRewardService,
    CampaignService,
    build_social_post,
)
from apps.loyalty.services import get_staff_for_user
from core.images import CAMPAIGN_MAX_DIM, compress_image
from core.pagination import StandardResultsSetPagination
from core.permissions import IsBusinessOwner, IsStaff
from core.response import success_response


class _OwnerMixin(APIView):
    """Shared owner-context helpers for the business campaign views."""

    permission_classes = [IsBusinessOwner]

    @staticmethod
    def _business(request):
        return request.user.owned_business


class CampaignListCreateView(_OwnerMixin, APIView):
    serializer_class = CampaignWriteSerializer
    pagination_class = StandardResultsSetPagination
    throttle_scope = "campaign_write"

    def get_throttles(self):
        # Only the write verb is rate-limited beyond the global user rate; the
        # list GET rides the default user throttle. Source: backend.md (throttle
        # every write endpoint).
        if self.request.method == "POST":
            from rest_framework.throttling import ScopedRateThrottle

            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get(self, request):
        campaigns = CampaignService.list_for_business(self._business(request))
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(campaigns, request, view=self)
        return paginator.get_paginated_response(
            CampaignSerializer(page, many=True).data
        )

    def post(self, request):
        serializer = CampaignWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        rule = data.pop("rule", None)
        reward = data.pop("reward", None)
        campaign = CampaignService.author_campaign(
            self._business(request), request.user, data, rule=rule, reward=reward
        )
        return success_response(CampaignSerializer(campaign).data, status=201)


class CampaignDetailView(_OwnerMixin, APIView):
    serializer_class = CampaignWriteSerializer
    throttle_scope = "campaign_write"

    def get_throttles(self):
        if self.request.method in {"PUT", "PATCH"}:
            from rest_framework.throttling import ScopedRateThrottle

            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get(self, request, campaign_id):
        campaign = CampaignService.get_for_business(campaign_id, self._business(request))
        return success_response(CampaignSerializer(campaign).data)

    def put(self, request, campaign_id):
        business = self._business(request)
        campaign = CampaignService.get_for_business(campaign_id, business)
        serializer = CampaignWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        rule = data.pop("rule", None)
        reward = data.pop("reward", None)
        campaign = CampaignService.update_campaign_with_relations(
            campaign, business, data, rule=rule, reward=reward
        )
        return success_response(CampaignSerializer(campaign).data)


class _CampaignActionView(_OwnerMixin, APIView):
    """Base for a single lifecycle transition (publish/pause/resume/end/cancel)."""

    serializer_class = CampaignSerializer
    throttle_scope = "campaign_write"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    # Subclasses set this to the CampaignService classmethod name to invoke.
    service_action: str = ""

    def post(self, request, campaign_id):
        business = self._business(request)
        campaign = CampaignService.get_for_business(campaign_id, business)
        action = getattr(CampaignService, self.service_action)
        campaign = action(campaign, business)
        return success_response(CampaignSerializer(campaign).data)


class CampaignPublishView(_CampaignActionView):
    service_action = "publish_campaign"


class CampaignPauseView(_CampaignActionView):
    service_action = "pause"


class CampaignResumeView(_CampaignActionView):
    service_action = "resume"


class CampaignEndView(_CampaignActionView):
    service_action = "end"


class CampaignCancelView(_CampaignActionView):
    service_action = "cancel"


class CampaignDuplicateView(_OwnerMixin, APIView):
    serializer_class = CampaignSerializer
    throttle_scope = "campaign_write"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    def post(self, request, campaign_id):
        business = self._business(request)
        source = CampaignService.get_for_business(campaign_id, business)
        data = {
            "name": f"{source.name} (copy)",
            "description": source.description,
            "campaign_type": source.campaign_type,
            "start_at": source.start_at,
            "end_at": source.end_at,
            "active_days": source.active_days,
            "active_start_time": source.active_start_time,
            "active_end_time": source.active_end_time,
            "max_participants": source.max_participants,
            "max_rewards": source.max_rewards,
            "completion_limit_per_customer": source.completion_limit_per_customer,
            "auto_join_enabled": source.auto_join_enabled,
            "allow_multiple_campaign_counting": source.allow_multiple_campaign_counting,
        }
        rule = getattr(source, "rule", None)
        reward = getattr(source, "reward", None)
        rule_data = (
            {
                "rule_type": rule.rule_type,
                "required_count": rule.required_count,
                "minimum_time_between_actions": rule.minimum_time_between_actions,
                "max_count_per_day": rule.max_count_per_day,
                "required_group_size": rule.required_group_size,
                "group_checkin_window_minutes": rule.group_checkin_window_minutes,
                "window_before_time": rule.window_before_time,
            }
            if rule is not None
            else None
        )
        reward_data = (
            {
                "reward_type": reward.reward_type,
                "title": reward.title,
                "description": reward.description,
                "estimated_cost": reward.estimated_cost,
                "expiry_days_after_unlock": reward.expiry_days_after_unlock,
                "max_redemptions": reward.max_redemptions,
                "reward_receiver_type": reward.reward_receiver_type,
            }
            if reward is not None
            else None
        )
        campaign = CampaignService.author_campaign(
            business, request.user, data, rule=rule_data, reward=reward_data
        )
        return success_response(CampaignSerializer(campaign).data, status=201)


class CampaignParticipantsView(_OwnerMixin, APIView):
    serializer_class = CampaignParticipantSerializer
    pagination_class = StandardResultsSetPagination

    def get(self, request, campaign_id):
        campaign = CampaignService.get_for_business(campaign_id, self._business(request))
        participants = CampaignService.participants_for(campaign)
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(participants, request, view=self)
        return paginator.get_paginated_response(
            CampaignParticipantSerializer(page, many=True).data
        )


class CampaignVouchersView(_OwnerMixin, APIView):
    serializer_class = CampaignRewardVoucherSerializer
    pagination_class = StandardResultsSetPagination

    def get(self, request, campaign_id):
        campaign = CampaignService.get_for_business(campaign_id, self._business(request))
        vouchers = CampaignRewardService.vouchers_for_campaign(campaign)
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(vouchers, request, view=self)
        return paginator.get_paginated_response(
            CampaignRewardVoucherSerializer(
                page, many=True, context={"request": request}
            ).data
        )


class CampaignAnalyticsView(_OwnerMixin, APIView):
    serializer_class = CampaignMetricsSerializer

    def get(self, request, campaign_id):
        campaign = CampaignService.get_for_business(campaign_id, self._business(request))
        metrics = CampaignAnalyticsService.campaign_metrics(campaign)
        return success_response(CampaignMetricsSerializer(metrics).data)


class CampaignImageUploadView(_OwnerMixin, APIView):
    """Upload the campaign's social-share image (social-share feature).

    Owner-only (``_OwnerMixin``). The serializer validates the file is a real
    image; the view sets it on the owned campaign and returns the updated campaign
    via :class:`CampaignSerializer` (whose ``image`` field is the relative media
    url). Write surface, so it is scoped-throttled like the other campaign writes.
    """

    serializer_class = CampaignImageUploadSerializer
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "campaign_write"

    def get_throttles(self):
        return [ScopedRateThrottle()]

    def post(self, request, campaign_id):
        business = self._business(request)
        campaign = CampaignService.get_for_business(campaign_id, business)
        serializer = CampaignImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Compress before storing — social cards are shared at post/story size.
        campaign.image = compress_image(serializer.validated_data["image"], max_dim=CAMPAIGN_MAX_DIM)
        campaign.save(update_fields=["image", "updated_at"])
        return success_response(CampaignSerializer(campaign).data)


class CampaignSocialPostView(_OwnerMixin, APIView):
    """Return the campaign's ready-to-paste social-share kit (social-share feature).

    Owner-only. Delegates the copy/link/hashtag generation to
    :func:`build_social_post` and shapes it with :class:`SocialPostSerializer`.
    """

    serializer_class = SocialPostSerializer

    def get(self, request, campaign_id):
        campaign = CampaignService.get_for_business(campaign_id, self._business(request))
        post = build_social_post(campaign)
        return success_response(SocialPostSerializer(post).data)


class CampaignVoucherCancelView(APIView):
    """Manager-only voucher cancellation (plan §1.3 — manager-gated).

    Permission is ``IsStaff``: the caller must be a staff user, and the service
    further enforces the MANAGER role (``StaffMember.role``) — a non-manager
    staff member is rejected by the service with ``PERMISSION_DENIED``. Lives on
    the business surface because it is a back-office action, but the actor is a
    manager StaffMember, not the owner role.
    """

    permission_classes = [IsStaff]
    serializer_class = CancelVoucherSerializer
    throttle_scope = "campaign_write"

    def get_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        return [ScopedRateThrottle()]

    def post(self, request, voucher_id):
        serializer = CancelVoucherSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        manager = get_staff_for_user(request.user)
        voucher = CampaignRewardService.cancel_voucher(
            voucher_id, manager, serializer.validated_data["reason"]
        )
        return success_response(
            CampaignRewardVoucherSerializer(voucher, context={"request": request}).data
        )
