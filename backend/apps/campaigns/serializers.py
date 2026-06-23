"""Serializers for the campaigns app (plan §1.3).

These own **shape/format** validation only (required fields, types, lengths, enum
membership). Business-rule validation — ownership, the publish-readiness gate, the
eligibility pipeline — lives in the service layer and is never duplicated here.
Computed read-only fields surface denormalised values (rule/reward summary, the
voucher QR url) without a second round-trip.
"""

from __future__ import annotations

from rest_framework import serializers
from rest_framework.utils.serializer_helpers import ReturnDict

from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignReward,
    CampaignRewardVoucher,
    CampaignRule,
    GroupSession,
)
from core.frontend import frontend_base_url


class CampaignRuleSerializer(serializers.ModelSerializer):
    """Completion rule for a campaign (visit count / time window / group)."""

    class Meta:
        model = CampaignRule
        fields = (
            "rule_type",
            "required_count",
            "minimum_time_between_actions",
            "max_count_per_day",
            "required_group_size",
            "group_checkin_window_minutes",
            "window_before_time",
        )


class CampaignRewardSerializer(serializers.ModelSerializer):
    """The reward unlocked when a campaign completes."""

    class Meta:
        model = CampaignReward
        fields = (
            "reward_type",
            "title",
            "description",
            "estimated_cost",
            "expiry_days_after_unlock",
            "max_redemptions",
            "reward_receiver_type",
        )


class CampaignWriteSerializer(serializers.ModelSerializer):
    """Create/update payload for a campaign and its nested rule + reward.

    Validates only the *shape* of the payload. The nested ``rule`` and ``reward``
    are accepted here so the wizard can author the whole campaign in one call; the
    service decides whether the resulting campaign is publishable (§23). ``status``,
    ``business`` and ``created_by`` are server-owned and never read from input.
    """

    rule = CampaignRuleSerializer(required=False)
    reward = CampaignRewardSerializer(required=False)

    class Meta:
        model = Campaign
        fields = (
            "name",
            "description",
            "image",
            "campaign_type",
            "start_at",
            "end_at",
            "active_days",
            "active_start_time",
            "active_end_time",
            "max_participants",
            "max_rewards",
            "completion_limit_per_customer",
            "auto_join_enabled",
            "allow_multiple_campaign_counting",
            "rule",
            "reward",
        )


class CampaignSerializer(serializers.ModelSerializer):
    """Read representation of a campaign with its rule + reward summary.

    ``required_count`` and ``reward_title`` are flattened convenience fields the
    list/detail screens read directly. All fields are read-only — writes go
    through :class:`CampaignWriteSerializer`.
    """

    business_name = serializers.CharField(source="business.name", read_only=True)
    rule = CampaignRuleSerializer(read_only=True)
    reward = CampaignRewardSerializer(read_only=True)
    required_count = serializers.SerializerMethodField()
    reward_title = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = (
            "id",
            "business",
            "business_name",
            "created_by",
            "name",
            "description",
            "image",
            "campaign_type",
            "status",
            "start_at",
            "end_at",
            "active_days",
            "active_start_time",
            "active_end_time",
            "max_participants",
            "max_rewards",
            "completion_limit_per_customer",
            "auto_join_enabled",
            "allow_multiple_campaign_counting",
            "rule",
            "reward",
            "required_count",
            "reward_title",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_required_count(self, obj: Campaign) -> int:
        rule = getattr(obj, "rule", None)
        return rule.required_count if rule is not None else 1

    def get_reward_title(self, obj: Campaign) -> str | None:
        reward = getattr(obj, "reward", None)
        return reward.title if reward is not None else None


class CampaignProgressSerializer(serializers.ModelSerializer):
    """The requesting customer's progress on a campaign (read-only).

    ``voucher_id`` is the id of the participant's *currently ACTIVE*
    :class:`CampaignRewardVoucher` for this campaign (else ``None``). It is part of
    the locked FE/BE progress contract: the customer ``my_progress`` payload emits
    ``progress_count``/``required_count``/``status``/``voucher_id`` so the frontend
    can deep-link straight to a presentable voucher without a second wallet query.
    Only an ACTIVE voucher is surfaced — a REDEEMED/EXPIRED/CANCELLED one is not a
    live reward to present, so the field goes back to ``None``.
    """

    required_count = serializers.SerializerMethodField()
    voucher_id = serializers.SerializerMethodField()

    class Meta:
        model = CampaignParticipant
        fields = (
            "id",
            "status",
            "progress_count",
            "required_count",
            "completion_cycle",
            "joined_at",
            "completed_at",
            "last_progress_at",
            "voucher_id",
        )
        read_only_fields = fields

    def get_required_count(self, obj: CampaignParticipant) -> int:
        rule = getattr(obj.campaign, "rule", None)
        return rule.required_count if rule is not None else 1

    def get_voucher_id(self, obj: CampaignParticipant) -> str | None:
        voucher = (
            CampaignRewardVoucher.objects.filter(
                campaign_id=obj.campaign_id,
                customer_id=obj.customer_id,
                status=CampaignRewardVoucher.Status.ACTIVE,
            )
            .order_by("-issued_at", "-created_at")
            .values_list("id", flat=True)
            .first()
        )
        return str(voucher) if voucher is not None else None


class CampaignDetailSerializer(CampaignSerializer):
    """Campaign detail plus the requesting customer's progress (read-only).

    ``my_progress`` is populated from ``self.context["participant"]`` (the view
    looks it up) and is ``None`` when the customer has not joined.
    """

    my_progress = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        # The full read representation plus the requesting customer's progress.
        # Listed explicitly (rather than extending the base tuple) so the field
        # set is self-describing and the type checker sees a concrete tuple.
        fields = (
            "id",
            "business",
            "business_name",
            "created_by",
            "name",
            "description",
            "image",
            "campaign_type",
            "status",
            "start_at",
            "end_at",
            "active_days",
            "active_start_time",
            "active_end_time",
            "max_participants",
            "max_rewards",
            "completion_limit_per_customer",
            "auto_join_enabled",
            "allow_multiple_campaign_counting",
            "rule",
            "reward",
            "required_count",
            "reward_title",
            "created_at",
            "updated_at",
            "my_progress",
        )
        read_only_fields = fields

    def get_my_progress(self, obj: Campaign) -> ReturnDict | None:
        participant = self.context.get("participant")
        if participant is None:
            return None
        return CampaignProgressSerializer(participant).data


class CampaignParticipantSerializer(serializers.ModelSerializer):
    """A participant row for the business-side participants list (read-only)."""

    customer_name = serializers.CharField(source="customer.name", read_only=True)
    required_count = serializers.SerializerMethodField()

    class Meta:
        model = CampaignParticipant
        fields = (
            "id",
            "customer",
            "customer_name",
            "status",
            "progress_count",
            "required_count",
            "completion_cycle",
            "joined_at",
            "completed_at",
            "last_progress_at",
        )
        read_only_fields = fields

    def get_required_count(self, obj: CampaignParticipant) -> int:
        rule = getattr(obj.campaign, "rule", None)
        return rule.required_count if rule is not None else 1


class CampaignRewardVoucherSerializer(serializers.ModelSerializer):
    """A campaign reward voucher (wallet + business voucher list, read-only).

    ``qr_url`` and ``qr_token`` are the redemption QR the customer presents to
    staff; ``qr_url`` is built against the requesting origin so a scan opens the
    right host. ``reward_title``/``campaign_name``/``business_name`` flatten the
    related rows for the card UI.
    """

    qr_token = serializers.CharField(source="qr_token.token", read_only=True, default=None)
    qr_url = serializers.SerializerMethodField()
    reward_title = serializers.CharField(source="reward.title", read_only=True)
    reward_description = serializers.CharField(source="reward.description", read_only=True)
    campaign_name = serializers.CharField(source="campaign.name", read_only=True)
    business_name = serializers.CharField(source="business.name", read_only=True)

    class Meta:
        model = CampaignRewardVoucher
        fields = (
            "id",
            "voucher_code",
            "status",
            "qr_token",
            "qr_url",
            "reward_title",
            "reward_description",
            "campaign",
            "campaign_name",
            "business",
            "business_name",
            "issued_at",
            "expires_at",
            "redeemed_at",
            "cancel_reason",
            "created_at",
        )
        read_only_fields = fields

    def get_qr_url(self, obj: CampaignRewardVoucher) -> str | None:
        if obj.qr_token is None:
            return None
        request = self.context.get("request")
        return f"{frontend_base_url(request)}/q/{obj.qr_token.token}"


class GroupSessionSerializer(serializers.ModelSerializer):
    """A group session with its members flattened for the group screen (read-only)."""

    members = serializers.SerializerMethodField()

    class Meta:
        model = GroupSession
        fields = (
            "id",
            "campaign",
            "group_leader",
            "status",
            "required_size",
            "invite_token",
            "expires_at",
            "completed_at",
            "members",
            "created_at",
        )
        read_only_fields = fields

    def get_members(self, obj: GroupSession) -> list[dict]:
        return [
            {
                "id": str(member.id),
                "customer": str(member.customer_id),
                "status": member.status,
                "joined_at": member.joined_at,
                "checked_in_at": member.checked_in_at,
            }
            for member in obj.members.all()
        ]


class CampaignMetricsSerializer(serializers.Serializer):
    """Shape of the :class:`CampaignAnalyticsService.CampaignMetrics` dataclass."""

    campaign_id = serializers.CharField()
    views = serializers.IntegerField()
    joined = serializers.IntegerField()
    active = serializers.IntegerField()
    completed = serializers.IntegerField()
    issued = serializers.IntegerField()
    redeemed = serializers.IntegerField()
    expired = serializers.IntegerField()
    cancelled = serializers.IntegerField()
    redemption_rate = serializers.FloatField()
    estimated_cost = serializers.DecimalField(max_digits=14, decimal_places=2)
    new_customers = serializers.IntegerField()
    returning_customers = serializers.IntegerField()


# --- Write input serializers (action endpoints) -----------------------------


class CancelVoucherSerializer(serializers.Serializer):
    """Manager voucher-cancel input — a non-blank reason is required (§1.2)."""

    reason = serializers.CharField(max_length=500)


class ScanCustomerSerializer(serializers.Serializer):
    """Staff scan-customer input — the customer's personal QR token value."""

    token = serializers.CharField(max_length=128)


class ConfirmVisitSerializer(serializers.Serializer):
    """Staff confirm-visit input — the chosen campaign and the customer's QR token."""

    campaign_id = serializers.UUIDField()
    token = serializers.CharField(max_length=128)


class ScanVoucherSerializer(serializers.Serializer):
    """Staff scan/redeem-voucher input — a redeem QR token or a typed-in code."""

    token = serializers.CharField(required=False, max_length=128)
    code = serializers.CharField(required=False, max_length=64)

    def validate(self, attrs: dict) -> dict:
        if not attrs.get("token") and not attrs.get("code"):
            raise serializers.ValidationError("token or code is required")
        return attrs


class ConfirmGroupSerializer(serializers.Serializer):
    """Staff confirm-group input — the group session to confirm (§11)."""

    group_session_id = serializers.UUIDField()


class GroupJoinSerializer(serializers.Serializer):
    """Customer group-join input — the GROUP_INVITE token the leader shared (§11)."""

    invite_token = serializers.CharField(max_length=128)


# --- Read serializers for service dataclasses (staff scan results) -----------


class EligibleCampaignViewSerializer(serializers.Serializer):
    """Shape of one :class:`StaffScannerService.EligibleCampaignView` row."""

    campaign = CampaignSerializer()
    eligible = serializers.BooleanField()
    reason_code = serializers.CharField(allow_null=True)
    progress_count = serializers.IntegerField()
    required_count = serializers.IntegerField()


class CustomerScanResultSerializer(serializers.Serializer):
    """Shape of a :class:`StaffScannerService.CustomerScanResult`.

    ``customer`` and ``business`` are flattened to id + name so the staff UI can
    label the scan without dereferencing the model objects on the dataclass.
    """

    customer = serializers.SerializerMethodField()
    business = serializers.SerializerMethodField()
    campaigns = EligibleCampaignViewSerializer(many=True)

    def get_customer(self, obj) -> dict:
        return {"id": str(obj.customer.id), "name": getattr(obj.customer, "name", None)}

    def get_business(self, obj) -> dict:
        return {"id": str(obj.business.id), "name": obj.business.name}


class ProgressResultSerializer(serializers.Serializer):
    """Shape of a :class:`CampaignProgressService.ProgressResult` (confirm-visit).

    ``voucher`` is populated only when ``completed`` is ``True`` (the visit
    finished a cycle and minted a reward).
    """

    campaign = CampaignSerializer()
    completed = serializers.BooleanField()
    progress_count = serializers.IntegerField()
    required_count = serializers.IntegerField()
    voucher = serializers.SerializerMethodField()

    def get_voucher(self, obj) -> dict | None:
        if obj.voucher is None:
            return None
        return CampaignRewardVoucherSerializer(
            obj.voucher, context=self.context
        ).data


class GroupConfirmResultSerializer(serializers.Serializer):
    """Shape of a :class:`CampaignGroupService.GroupConfirmResult` (confirm-group).

    Carries the now-COMPLETED ``session`` and the single ``voucher`` minted for the
    group leader (plan Q4 — leader gets the one voucher). ``member_count`` is how
    many members were checked in so the staff UI can show the table size.
    """

    session = GroupSessionSerializer()
    member_count = serializers.IntegerField()
    voucher = serializers.SerializerMethodField()

    def get_voucher(self, obj) -> ReturnDict:
        return CampaignRewardVoucherSerializer(obj.voucher, context=self.context).data
