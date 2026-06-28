"""Serializers for the campaigns app (plan §1.3).

These own **shape/format** validation only (required fields, types, lengths, enum
membership). Business-rule validation — ownership, the publish-readiness gate, the
eligibility pipeline — lives in the service layer and is never duplicated here.
Computed read-only fields surface denormalised values (rule/reward summary, the
voucher QR url) without a second round-trip.
"""

from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers
from rest_framework.utils.serializer_helpers import ReturnDict

from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignReward,
    CampaignRewardVoucher,
    CampaignRule,
    Group,
    GroupMember,
)
from core.frontend import frontend_base_url


class CampaignRuleSerializer(serializers.ModelSerializer):
    """Completion rule for a campaign (visit count / time window / group)."""

    class Meta:
        model = CampaignRule
        fields = (
            "rule_type",
            "mechanic",
            "required_count",
            "required_spend",
            "min_spend",
            "max_banked",
            # Points → cashback fields (multi-form-loyalty design §1). Nullable;
            # only a POINTS-mechanic campaign sets them. Read and write so the
            # create wizard can author a points program.
            "points_basis",
            "points_per_visit",
            "points_per_som",
            "cashback_per_point",
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
            # Item-reward fields (multi-form-loyalty design §1). ``item_selection``
            # (fixed|customer) and ``catalog_item`` (the preset item PK when fixed)
            # are read+write so the create wizard can author an item reward.
            "item_selection",
            "catalog_item",
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
            "instagram_handle",
            "rule",
            "reward",
        )


class CampaignSerializer(serializers.ModelSerializer):
    """Read representation of a campaign with its rule + reward summary.

    ``required_count`` and ``reward_title`` are flattened convenience fields the
    list/detail screens read directly. ``my_progress`` carries the requesting
    customer's progress (the same ``{progress_count, required_count, status,
    voucher_id}`` shape the detail serializer emits, or ``None`` when not joined)
    so the redesigned customer campaigns list can render the "From places you go"
    carousel without a second round-trip; it is populated from a
    ``progress_context`` (:class:`CustomerProgressContext`) the view prefetches —
    when no context is supplied (business/staff list paths) it is ``None``. All
    fields are read-only — writes go through :class:`CampaignWriteSerializer`.

    Per-row aggregate fields used by the business list UI (``participants``,
    ``completed``, ``redeemed``, ``ends_label``) are populated from
    ``annotate_counts`` (called by the business list view) when present as
    queryset annotations. They default to 0/empty when the annotation is absent
    (e.g. customer/staff list paths that do not carry the annotation).
    """

    business_name = serializers.CharField(source="business.name", read_only=True)
    # Relative (/media/..) logo url of the owning business, so campaign cards can
    # show the brand mark instead of a bare glyph. None when the business has no logo.
    business_logo_url = serializers.SerializerMethodField()
    rule = CampaignRuleSerializer(read_only=True)
    reward = CampaignRewardSerializer(read_only=True)
    required_count = serializers.SerializerMethodField()
    reward_title = serializers.SerializerMethodField()
    my_progress = serializers.SerializerMethodField()
    # Emit the *relative* media url (``/media/campaigns/..``) rather than the
    # default ImageField absolute url, so the image resolves through the
    # frontend's same-origin proxy. ``None`` when no image is set.
    image = serializers.SerializerMethodField()
    # Per-row aggregate counts for the business list view. Values come from
    # queryset annotations added by the business list view; they fall back to 0
    # when the annotation is absent so non-business list paths are unaffected.
    # Field names match what adaptCampaignList (adapters.ts:114-117) reads.
    participants = serializers.SerializerMethodField()
    completed = serializers.SerializerMethodField()
    redeemed = serializers.SerializerMethodField()
    ends_label = serializers.SerializerMethodField()
    # The three type-specific headline stats for the business list card
    # (campaigns-restructure design §5). Read from the business-list annotations;
    # defaults to zeros on non-business paths.
    type_stats = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = (
            "id",
            "business",
            "business_name",
            "business_logo_url",
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
            "instagram_handle",
            "rule",
            "reward",
            "required_count",
            "reward_title",
            "my_progress",
            "participants",
            "completed",
            "redeemed",
            "ends_label",
            "type_stats",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_type_stats(self, obj: Campaign) -> dict:
        """Return the three type-specific headline stats for the list card (§5).

        Branches on ``campaign_type`` and reads the business-list annotations
        (``_participants``/``_redeemed``/``_groups``/``_members``/``_reach``/
        ``_close``); each defaults to 0 when the annotation is absent (non-business
        paths). Each slot carries a label so the UI renders the triplet without
        re-deriving the meaning.
        """
        redeemed = getattr(obj, "_redeemed", 0) or 0
        participants = getattr(obj, "_participants", 0) or 0
        if obj.campaign_type == Campaign.CampaignType.GROUP:
            return {
                "stat_a": {"label": "Groups created", "value": getattr(obj, "_groups", 0) or 0},
                "stat_b": {"label": "Customers joined", "value": getattr(obj, "_members", 0) or 0},
                "stat_c": {"label": "Redeemed", "value": redeemed},
            }
        if obj.campaign_type == Campaign.CampaignType.SOCIAL:
            return {
                "stat_a": {"label": "Joined", "value": participants},
                "stat_b": {"label": "Redeemed", "value": redeemed},
                "stat_c": {"label": "Reach", "value": getattr(obj, "_reach", 0) or 0},
            }
        return {
            "stat_a": {"label": "Enrolled", "value": participants},
            "stat_b": {"label": "Redeemed", "value": redeemed},
            "stat_c": {"label": "Close to reward", "value": getattr(obj, "_close", 0) or 0},
        }

    def get_business_logo_url(self, obj: Campaign) -> str | None:
        business = getattr(obj, "business", None)
        logo = getattr(business, "logo", None)
        return logo.url if logo else None

    def get_required_count(self, obj: Campaign) -> int:
        rule = getattr(obj, "rule", None)
        return rule.required_count if rule is not None else 1

    def get_reward_title(self, obj: Campaign) -> str | None:
        reward = getattr(obj, "reward", None)
        return reward.title if reward is not None else None

    def get_image(self, obj: Campaign) -> str | None:
        return obj.image.url if obj.image else None

    def get_participants(self, obj: Campaign) -> int:
        """Total unique participants from the queryset annotation, or 0.

        The annotation ``_participants`` is added by the business list view via
        ``annotate_list_queryset``; absent it (non-business paths) the field
        falls back to 0 so customer/staff list paths are unaffected.
        """
        return getattr(obj, "_participants", 0) or 0

    def get_completed(self, obj: Campaign) -> int:
        """Participants who have completed at least one cycle (annotated), or 0."""
        return getattr(obj, "_completed", 0) or 0

    def get_redeemed(self, obj: Campaign) -> int:
        """Vouchers redeemed against this campaign (annotated), or 0."""
        return getattr(obj, "_redeemed", 0) or 0

    def get_ends_label(self, obj: Campaign) -> str:
        """Human-readable end date label, or empty string when no end date is set."""
        if obj.end_at is None:
            return ""
        return obj.end_at.strftime("%b %-d, %Y")

    def get_my_progress(self, obj: Campaign) -> ReturnDict | None:
        """The requesting customer's progress for this campaign, or ``None``.

        Reads the prefetched ``progress_context`` from serializer context (a
        :class:`CustomerProgressContext`); ``None`` both when no context is
        supplied (non-customer list paths) and when the customer has no
        participant row for this campaign. The participant's ACTIVE ``voucher_id``
        is resolved from the same context map so this field never issues a query
        per row.
        """
        context = self.context.get("progress_context")
        if context is None:
            return None
        participant = context.participants.get(str(obj.id))
        if participant is None:
            return None
        # Reuse the list row's already-loaded Campaign (with its select_related
        # rule) as the participant's campaign, so CampaignProgressSerializer's
        # required_count lookup reads from memory instead of re-querying per row.
        participant.campaign = obj
        return CampaignProgressSerializer(
            participant,
            context={"active_voucher_ids": context.active_voucher_ids},
        ).data


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
            # Redeemable points for a POINTS program (multi-form-loyalty §1); 0 for
            # every other mechanic. Surfaced so the customer card shows the balance.
            "points_balance",
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
        # When the caller has already prefetched the customer's ACTIVE vouchers
        # (the campaigns list path — see CampaignService.progress_context_for),
        # it passes a {campaign_id: voucher_id} map in context so this field
        # resolves from memory and stays off the N+1 path. Absent that map (the
        # detail path), fall back to the single bounded per-participant query.
        voucher_map = self.context.get("active_voucher_ids")
        if voucher_map is not None:
            return voucher_map.get(str(obj.campaign_id))
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
    # Flattened owning-business fields the customer offer-detail header binds to
    # (campaigns-restructure offer-detail grid). ``business_name``/
    # ``business_logo_url`` come from the base serializer; these add the category
    # and location so a GROUP/SOCIAL offer card shows where to go. Empty string
    # when the business has not set the field.
    business_category = serializers.CharField(source="business.category", read_only=True)
    business_address = serializers.CharField(source="business.address", read_only=True)
    business_area = serializers.CharField(source="business.area", read_only=True)

    class Meta:
        model = Campaign
        # The full read representation plus the requesting customer's progress.
        # Listed explicitly (rather than extending the base tuple) so the field
        # set is self-describing and the type checker sees a concrete tuple.
        fields = (
            "id",
            "business",
            "business_name",
            "business_logo_url",
            "business_category",
            "business_address",
            "business_area",
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
            "instagram_handle",
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


class CampaignDiscoverQuerySerializer(serializers.Serializer):
    """Query params for the customer campaigns list (campaigns-redesign).

    Validates only the *shape* of the optional filters; the filtering rules live
    in :meth:`CampaignService.discover_for_customer`.

    * ``type`` — accepted as a free-form string so an unknown value degrades
      gracefully (the service ignores anything that is not a real
      ``Campaign.CampaignType``) rather than 400-ing the whole list. Empty/blank
      is treated as "no filter".
    * ``joined`` — ``true`` selects only the customer's JOINED/IN_PROGRESS
      campaigns (the "From places you go" set); defaults to ``False``.
    """

    type = serializers.CharField(required=False, allow_blank=True, max_length=32)
    joined = serializers.BooleanField(required=False, default=False)


class CampaignFeedQuerySerializer(serializers.Serializer):
    """Query params for the customer campaigns feed (campaigns-restructure §6).

    ``discover`` selects the discover-list filter
    (``all``/``group``/``neighborhood``/``ended``); the service degrades an
    unknown value to ``all``. Shape-only validation here.
    """

    discover = serializers.CharField(required=False, allow_blank=True, max_length=32)


class CampaignListQuerySerializer(serializers.Serializer):
    """Query params for the business campaign list (campaigns-restructure §5).

    Validates only the *shape* of the optional filters; the service owns the rules
    and ignores any value that is not a real type/status token so a bad param
    degrades to "no filter" rather than 400-ing the list.
    """

    type = serializers.CharField(required=False, allow_blank=True, max_length=32)
    status = serializers.CharField(required=False, allow_blank=True, max_length=32)


class CampaignParticipantSerializer(serializers.ModelSerializer):
    """A participant row for the business-side participants list (read-only).

    ``last_visit_label`` is a human-readable string of the participant's last
    recorded action timestamp (``last_progress_at``), or an empty string when no
    progress has been recorded yet. ``reward_label`` is the campaign reward title
    when the participant has completed (i.e. a reward was earned), otherwise an
    empty string. Both fields match the keys read by ``adaptParticipant``
    (adapters.ts:130-131).
    """

    customer_name = serializers.CharField(source="customer.name", read_only=True)
    required_count = serializers.SerializerMethodField()
    last_visit_label = serializers.SerializerMethodField()
    reward_label = serializers.SerializerMethodField()

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
            "last_visit_label",
            "reward_label",
        )
        read_only_fields = fields

    def get_required_count(self, obj: CampaignParticipant) -> int:
        rule = getattr(obj.campaign, "rule", None)
        return rule.required_count if rule is not None else 1

    def get_last_visit_label(self, obj: CampaignParticipant) -> str:
        """Human-readable label for the participant's last action time, or empty."""
        ts = obj.last_progress_at
        if ts is None:
            return ""
        return ts.strftime("%b %-d, %Y")

    def get_reward_label(self, obj: CampaignParticipant) -> str:
        """Campaign reward title when the participant has completed; else empty.

        Only COMPLETED/REDEEMED statuses have earned the reward. For in-progress
        participants the column is left blank so the UI can show a dash via the
        adapter default.
        """
        completed_statuses = {CampaignParticipant.Status.COMPLETED, CampaignParticipant.Status.REDEEMED}
        if obj.status not in completed_statuses:
            return ""
        reward = getattr(obj.campaign, "reward", None)
        return reward.title if reward is not None else ""


class CampaignRewardVoucherSerializer(serializers.ModelSerializer):
    """A campaign reward voucher (wallet + business voucher list, read-only).

    ``qr_url`` and ``qr_token`` are the redemption QR the customer presents to
    staff; ``qr_url`` is built against the requesting origin so a scan opens the
    right host. ``reward_title``/``campaign_name``/``business_name`` flatten the
    related rows for the card UI. ``redeemed_by`` is the name of the staff member
    who redeemed the voucher, or an empty string when not yet redeemed — matches
    the ``redeemed_by`` key read by ``adaptVoucherRow`` (adapters.ts:143).
    """

    qr_token = serializers.CharField(source="qr_token.token", read_only=True, default=None)
    qr_url = serializers.SerializerMethodField()
    reward_title = serializers.CharField(source="reward.title", read_only=True)
    reward_description = serializers.CharField(source="reward.description", read_only=True)
    reward_type = serializers.CharField(source="reward.reward_type", read_only=True)
    # How the item is chosen for this voucher's reward (fixed|customer|null). The FE
    # reads this to decide whether to show a "pick from menu" sheet at present time.
    item_selection = serializers.CharField(source="reward.item_selection", read_only=True, default=None)
    # The granted CatalogItem (id + name), preset or customer-chosen; null when none
    # has been attached yet (cashback voucher, or unpicked customer-choice item).
    catalog_item = serializers.SerializerMethodField()
    campaign_name = serializers.CharField(source="campaign.name", read_only=True)
    business_name = serializers.CharField(source="business.name", read_only=True)
    redeemed_by = serializers.SerializerMethodField()

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
            "reward_type",
            "item_selection",
            "catalog_item",
            # Som-off value of a CASHBACK voucher (multi-form-loyalty §1); null on
            # every non-cashback voucher.
            "cashback_amount",
            "campaign",
            "campaign_name",
            "business",
            "business_name",
            "issued_at",
            "expires_at",
            "redeemed_at",
            "redeemed_by",
            "cancel_reason",
            "created_at",
        )
        read_only_fields = fields

    def get_catalog_item(self, obj: CampaignRewardVoucher) -> dict | None:
        """Return the attached CatalogItem as ``{id, name, price}``, or ``None``.

        Reads ``obj.catalog_item`` (the preset or customer-chosen item). ``None``
        when no item is attached — a cashback voucher, or a customer-choice item
        voucher before the customer has picked.
        """
        item = getattr(obj, "catalog_item", None)
        if item is None:
            return None
        return {"id": str(item.id), "name": item.name, "price": item.price}

    def get_qr_url(self, obj: CampaignRewardVoucher) -> str | None:
        if obj.qr_token is None:
            return None
        request = self.context.get("request")
        return f"{frontend_base_url(request)}/q/{obj.qr_token.token}"

    def get_redeemed_by(self, obj: CampaignRewardVoucher) -> str:
        """Name of the staff member who redeemed this voucher, or empty string."""
        staff = getattr(obj, "redeemed_by_staff", None)
        if staff is None:
            return ""
        return getattr(staff, "name", "") or ""


class GroupSerializer(serializers.ModelSerializer):
    """A group session flattened for the customer group screen (read-only).

    Emits everything the group-detail UI binds to: the owning campaign (flattened
    to ``campaign`` id + ``campaign_name`` + ``business_name`` + ``business_logo_url``
    so the card renders the brand without a second round-trip), the lifecycle
    ``status``, ``required_size`` and the live ``joined_count`` (members still
    JOINED/CHECKED_IN), the member roster (each with ``name``, ``is_leader`` and
    their ``status``), the invite token surfaced both as ``invite_token`` (legacy
    key) and ``invite_code`` plus the scannable ``invite_url``, the ``checkin_token``
    the leader shows once the group is FULL, and the leader-chosen ``visit_time`` /
    group ``name`` / ``note``. All fields are read-only.
    """

    members = serializers.SerializerMethodField()
    joined_count = serializers.SerializerMethodField()
    # The invite token is the canonical short code; surface it under both keys so
    # the FE can read either. `invite_code` is the alias the group screen binds to.
    invite_code = serializers.CharField(source="invite_token", read_only=True)
    invite_url = serializers.SerializerMethodField()
    # The QR the leader presents for the coordinated check-in once the group fills.
    # There is no separate check-in token in the model — the GROUP_INVITE token is
    # reused at check-in — so this exposes `invite_token` only while FULL, else null.
    checkin_token = serializers.SerializerMethodField()
    campaign_name = serializers.CharField(source="campaign.name", read_only=True)
    business_name = serializers.CharField(source="campaign.business.name", read_only=True)
    business_logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = (
            "id",
            "campaign",
            "campaign_name",
            "business_name",
            "business_logo_url",
            "group_leader",
            "status",
            "required_size",
            "joined_count",
            "invite_token",
            "invite_code",
            "invite_url",
            "checkin_token",
            "visit_time",
            "name",
            "note",
            "expires_at",
            "completed_at",
            "members",
            "created_at",
        )
        read_only_fields = fields

    def get_members(self, obj: Group) -> list[dict]:
        leader_id = obj.group_leader_id
        return [
            {
                "id": str(member.id),
                "customer": str(member.customer_id),
                "name": getattr(member.customer, "name", "") or "",
                "is_leader": member.customer_id == leader_id,
                "status": member.status,
                "joined_at": member.joined_at,
                "checked_in_at": member.checked_in_at,
            }
            for member in obj.members.all()
        ]

    def get_joined_count(self, obj: Group) -> int:
        """Count members still in the group (JOINED/CHECKED_IN); LEFT/NO_SHOW excluded."""
        active = {GroupMember.Status.JOINED, GroupMember.Status.CHECKED_IN}
        return sum(1 for member in obj.members.all() if member.status in active)

    def get_invite_url(self, obj: Group) -> str | None:
        """The scannable invite URL, built against the requesting origin when present."""
        request = self.context.get("request")
        if request is None:
            return None
        return f"{frontend_base_url(request)}/q/{obj.invite_token}"

    def get_checkin_token(self, obj: Group) -> str | None:
        """The GROUP_INVITE token to present at check-in, only once the group is FULL."""
        if obj.status == Group.Status.FULL:
            return obj.invite_token
        return None

    def get_business_logo_url(self, obj: Group) -> str | None:
        business = getattr(obj.campaign, "business", None)
        logo = getattr(business, "logo", None)
        return logo.url if logo else None


class CampaignTypeStatsSerializer(serializers.Serializer):
    """Shape of the :class:`CampaignAnalyticsService.CampaignTypeStats` triplet."""

    campaign_id = serializers.CharField()
    campaign_type = serializers.CharField()
    stat_a = serializers.IntegerField()
    stat_b = serializers.IntegerField()
    stat_c = serializers.IntegerField()
    labels = serializers.DictField(child=serializers.CharField())


class CampaignDetailTabsSerializer(serializers.Serializer):
    """Tabbed business campaign-detail payload (campaigns-restructure design §5).

    Pass-through of pre-serialized tab payloads assembled in the view:
    ``overview`` + ``settings`` (the campaign), ``participants``,
    ``reward_usage`` (vouchers), ``groups`` (GROUP only; empty otherwise), and
    ``analytics`` (metrics + the per-type stat triplet). Listed explicitly so the
    response is a documented contract, not an ad-hoc dict.
    """

    overview = serializers.DictField()
    settings = serializers.DictField()
    participants = serializers.ListField(child=serializers.DictField())
    reward_usage = serializers.ListField(child=serializers.DictField())
    groups = serializers.ListField(child=serializers.DictField())
    analytics = serializers.DictField()


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


class GroupSessionStartSerializer(serializers.Serializer):
    """Leader's group-start input — all optional (richer customer GROUP flow).

    Shape-only validation of the optional ``visit_time`` (ISO 8601 datetime slot),
    ``name`` (group label, max 80 to match ``Group.name``), and ``note`` (message
    to invited friends). Any business rules about the values live in the service.
    """

    visit_time = serializers.DateTimeField(required=False, allow_null=True)
    name = serializers.CharField(required=False, allow_blank=True, max_length=80)
    note = serializers.CharField(required=False, allow_blank=True)


class CancelVoucherSerializer(serializers.Serializer):
    """Manager voucher-cancel input — a non-blank reason is required (§1.2)."""

    reason = serializers.CharField(max_length=500)


class RedeemPointsSerializer(serializers.Serializer):
    """Customer redeem-points input — a positive whole ``points`` amount (§1).

    Shape-only: a positive integer. The balance check and cashback math live in
    :meth:`CampaignRewardService.redeem_points`.
    """

    points = serializers.IntegerField(min_value=1)


class SelectVoucherItemSerializer(serializers.Serializer):
    """Customer select-item input — the chosen ``catalog_item_id`` (§1).

    Shape-only: a UUID. Ownership, the customer-choice gate, and the
    same-business item check live in :meth:`CampaignRewardService.select_voucher_item`.
    """

    catalog_item_id = serializers.UUIDField()


class LoyaltyProgramSerializer(serializers.Serializer):
    """Shape of one :class:`LoyaltyProgramView` row (multi-form-loyalty design §2).

    Read-only presentation of a business's loyalty program + the requesting
    customer's state, backing the business-page "Loyalty" section. Each field maps
    1:1 to the dataclass; ``cashback_per_point`` is null for non-POINTS programs.
    """

    campaign_id = serializers.CharField()
    name = serializers.CharField()
    mechanic = serializers.CharField()
    reward_summary = serializers.CharField(allow_blank=True)
    joined = serializers.BooleanField()
    progress_count = serializers.IntegerField()
    target = serializers.IntegerField()
    points_balance = serializers.IntegerField()
    cashback_per_point = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )


class CampaignImageUploadSerializer(serializers.Serializer):
    """Campaign image-upload input — a single ``image`` file (social-share feature).

    ``ImageField`` enforces that the upload is a valid, decodable image (shape/
    format validation); persisting it onto the campaign is the view's concern.
    """

    image = serializers.ImageField()


class SocialPostSerializer(serializers.Serializer):
    """Shape of the :class:`apps.campaigns.services.SocialPost` dataclass.

    Read-only presentation payload for the campaign social-share screen — the
    captions map and hashtag list are emitted verbatim for the business to paste.
    """

    headline = serializers.CharField()
    reward_title = serializers.CharField(allow_blank=True)
    subtext = serializers.CharField(allow_blank=True)
    button_text = serializers.CharField()
    auto_join_url = serializers.CharField()
    image_url = serializers.CharField(allow_null=True)
    captions = serializers.DictField(child=serializers.CharField())
    hashtags = serializers.ListField(child=serializers.CharField())


class ScanCustomerSerializer(serializers.Serializer):
    """Staff scan-customer input — the customer's personal QR token value."""

    token = serializers.CharField(max_length=128)


class UnifiedConfirmVisitSerializer(serializers.Serializer):
    """Unified staff scan input — the customer's QR token + optional campaign.

    ``campaign_id`` is optional: when omitted the service picks the single
    prioritized eligible campaign (§14); when present the staff tapped a specific
    campaign and that one is targeted.

    ``amount`` is the staff-entered bill for the chosen program. It is shape-only
    here (a non-negative decimal); whether it is *required* is a business rule the
    service enforces — a SPEND mechanic or a POINTS spend-basis program needs a
    positive amount, every other mechanic ignores it.
    """

    token = serializers.CharField(max_length=128)
    campaign_id = serializers.UUIDField(required=False)
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, min_value=Decimal("0")
    )


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


class ConfirmSocialSerializer(serializers.Serializer):
    """Staff confirm-social input — the customer QR token + target campaign (§5/§7).

    The staff scans the customer's personal QR (``token``) and selects the SOCIAL
    campaign (``campaign_id``) to verify the follow/tag proof against.
    """

    token = serializers.CharField(max_length=128)
    campaign_id = serializers.UUIDField()


# --- Read serializers for service dataclasses (staff scan results) -----------


class EligibleCampaignViewSerializer(serializers.Serializer):
    """Shape of one :class:`StaffScannerService.EligibleCampaignView` row.

    Beyond the eligibility + progress fields, each row exposes the per-program
    fields the staff loyalty chooser binds to render a program by type and preview
    a POINTS award: ``mechanic``, ``campaign_type``, ``reward_title``, the
    customer's ``points_balance`` and ``current_spend``, and the POINTS accrual /
    cashback rates (``points_per_som``, ``points_per_visit``,
    ``cashback_per_point`` — ``null`` for non-points programs).
    """

    campaign = CampaignSerializer()
    eligible = serializers.BooleanField()
    reason_code = serializers.CharField(allow_null=True)
    progress_count = serializers.IntegerField()
    required_count = serializers.IntegerField()
    mechanic = serializers.CharField(allow_null=True)
    campaign_type = serializers.CharField()
    reward_title = serializers.CharField(allow_null=True)
    points_balance = serializers.IntegerField()
    points_per_som = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )
    points_per_visit = serializers.IntegerField(allow_null=True)
    cashback_per_point = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )
    current_spend = serializers.DecimalField(max_digits=12, decimal_places=2)


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
    finished a cycle and minted a reward). ``points_balance`` echoes the
    participant's redeemable points balance *after* the action so a POINTS award
    can show the updated total; it is the running balance for every mechanic
    (0 when no points are tracked).
    """

    campaign = CampaignSerializer()
    completed = serializers.BooleanField()
    progress_count = serializers.IntegerField()
    required_count = serializers.IntegerField()
    points_balance = serializers.SerializerMethodField()
    voucher = serializers.SerializerMethodField()

    def get_points_balance(self, obj) -> int:
        participant = getattr(obj, "participant", None)
        return participant.points_balance if participant is not None else 0

    def get_voucher(self, obj) -> dict | None:
        if obj.voucher is None:
            return None
        return CampaignRewardVoucherSerializer(
            obj.voucher, context=self.context
        ).data


def _mask_phone(phone: str | None) -> str:
    """Mask a phone number to its last two digits (``+99670XXXX01`` → ``…01``).

    Staff sees only enough to disambiguate; the rest is hidden so the unified
    scan response never leaks a full PII phone number.
    """
    if not phone:
        return ""
    tail = phone[-2:]
    return f"{'•' * max(len(phone) - 2, 0)}{tail}"


class UnifiedScanResultSerializer(serializers.Serializer):
    """Shape of a :class:`StaffScannerService.UnifiedScanResult` (unified scan).

    Emits exactly: ``customer`` (name + masked phone), the list of advanced
    campaign ``ProgressResult`` shapes (``campaigns``), and the list of
    ``skipped_campaigns`` (each ``campaign_id`` + ``name`` + ``reason_code``).
    Post-restructure there is no loyalty leg — a loyalty card is now an INDIVIDUAL
    campaign, so it advances through ``campaigns`` like any other.
    """

    customer = serializers.SerializerMethodField()
    campaigns = serializers.SerializerMethodField()
    skipped_campaigns = serializers.SerializerMethodField()

    def get_customer(self, obj) -> dict:
        return {
            "name": getattr(obj.customer, "name", None),
            "phone": _mask_phone(getattr(obj.customer, "phone", None)),
        }

    def get_campaigns(self, obj) -> list:
        return ProgressResultSerializer(
            obj.campaigns, many=True, context=self.context
        ).data

    def get_skipped_campaigns(self, obj) -> list:
        return [
            {"campaign_id": str(sc.campaign_id), "name": sc.name, "reason_code": sc.reason_code}
            for sc in obj.skipped_campaigns
        ]


class ScanDispatchSerializer(serializers.Serializer):
    """Shape of a :class:`StaffScannerService.ScanDispatch` (unified resolve).

    Emits the routing ``kind`` plus exactly the payload for that kind: the
    customer scan result for ``"customer"``, the voucher for ``"voucher"``, or a
    ``reason`` code for ``"invalid"``. The other fields are ``null``.
    """

    kind = serializers.CharField()
    customer = serializers.SerializerMethodField()
    voucher = serializers.SerializerMethodField()
    reason = serializers.SerializerMethodField()

    def get_customer(self, obj) -> dict | None:
        if obj.customer_result is None:
            return None
        return CustomerScanResultSerializer(obj.customer_result).data

    def get_voucher(self, obj) -> dict | None:
        if obj.voucher is None:
            return None
        return CampaignRewardVoucherSerializer(obj.voucher, context=self.context).data

    def get_reason(self, obj) -> str | None:
        return obj.reason_code


class GroupConfirmResultSerializer(serializers.Serializer):
    """Shape of a :class:`CampaignGroupService.GroupConfirmResult` (confirm-group).

    Carries the now-COMPLETED ``session`` and the single ``voucher`` minted for the
    group leader (plan Q4 — leader gets the one voucher). ``member_count`` is how
    many members were checked in so the staff UI can show the table size.
    """

    session = GroupSerializer()
    member_count = serializers.IntegerField()
    voucher = serializers.SerializerMethodField()

    def get_voucher(self, obj) -> ReturnDict:
        return CampaignRewardVoucherSerializer(obj.voucher, context=self.context).data
