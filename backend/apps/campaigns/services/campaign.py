"""Campaign lifecycle and authoring (plan §1.2 / §23).

Owns create/update/publish and the status machine
(DRAFT → SCHEDULED → ACTIVE → PAUSED → ENDED / CANCELLED), plus the
business-facing list and the customer-facing discover surface. Publish runs the
§23 readiness rules (a reward exists, dates are sane, the visit count is set,
the business owns the campaign) before a campaign can ever count a visit.
"""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field as dc_field
from datetime import datetime, timedelta

from django.db import models, transaction
from django.utils import timezone
from rest_framework import status

from apps.businesses.models import Business
from apps.campaigns.constants import CAMPAIGN_ENDING_WARNING_HOURS
from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignReward,
    CampaignRewardVoucher,
    CampaignRule,
)
from core.exceptions import JaqynAPIException
from core.logging import emit_event


@dataclass(frozen=True)
class CustomerProgressContext:
    """Per-customer progress lookup tables for the campaigns list (no N+1).

    Built once in :meth:`CampaignService.progress_context_for` so the list
    serializer can resolve each campaign's ``my_progress`` from memory instead of
    one query per row. ``participants`` maps a campaign id to the requesting
    customer's :class:`CampaignParticipant`; ``active_voucher_ids`` maps a campaign
    id to that customer's currently-ACTIVE voucher id (the locked ``voucher_id``
    field of the progress contract), absent when there is no live voucher.
    """

    participants: dict[str, CampaignParticipant] = dc_field(default_factory=dict)
    active_voucher_ids: dict[str, str] = dc_field(default_factory=dict)


class CampaignService:
    """Author and operate campaigns (plan §1.2).

    A single Business owns each campaign (plan D5); every method that mutates a
    campaign verifies ownership. Status transitions are validated here so a view
    never has to know the state machine.
    """

    # Statuses from which a campaign may still be edited as a draft. Source: plan
    # §1.2 (PUT edits a draft) — once published the authoring fields are locked.
    _EDITABLE_STATUSES = frozenset({Campaign.Status.DRAFT, Campaign.Status.SCHEDULED})

    @staticmethod
    def _assert_owned(campaign: Campaign, business: Business) -> None:
        """Raise ``PERMISSION_DENIED`` unless ``business`` owns ``campaign``."""
        if campaign.business_id != business.id:
            raise JaqynAPIException(
                "PERMISSION_DENIED", status_code=status.HTTP_403_FORBIDDEN
            )

    @staticmethod
    def create_campaign(business: Business, created_by, data: dict) -> Campaign:
        """Create a DRAFT campaign for a business (plan §1.2).

        Does no business-rule validation beyond what the serializer enforced —
        a draft may be incomplete. ``data`` holds already-validated campaign
        fields. The campaign starts in DRAFT regardless of any status in ``data``.
        """
        data = {k: v for k, v in data.items() if k not in {"status", "business", "created_by"}}
        campaign = Campaign.objects.create(
            business=business,
            created_by=created_by,
            status=Campaign.Status.DRAFT,
            **data,
        )
        emit_event(
            "campaign_created",
            business_id=str(business.id),
            campaign_id=str(campaign.id),
        )
        return campaign

    @classmethod
    def update_campaign(
        cls, campaign: Campaign, business: Business, data: dict
    ) -> Campaign:
        """Edit a draft/scheduled campaign in place (plan §1.2).

        Rejects edits once the campaign is ACTIVE/PAUSED/ENDED/CANCELLED
        (``CAMPAIGN_INVALID_STATE``) — a running campaign's terms are frozen.
        Ownership is enforced. ``status``/``business``/``created_by`` in ``data``
        are ignored; status changes go through the lifecycle methods.
        """
        cls._assert_owned(campaign, business)
        if campaign.status not in cls._EDITABLE_STATUSES:
            raise JaqynAPIException(
                "CAMPAIGN_INVALID_STATE",
                "Only a draft campaign can be edited",
                status.HTTP_409_CONFLICT,
            )
        for field, value in data.items():
            if field in {"status", "business", "created_by"}:
                continue
            setattr(campaign, field, value)
        campaign.save()
        return campaign

    @classmethod
    def author_campaign(
        cls,
        business: Business,
        created_by,
        data: dict,
        rule: dict | None = None,
        reward: dict | None = None,
    ) -> Campaign:
        """Create a DRAFT campaign together with its rule and reward (plan §1.2).

        One atomic block so the wizard can author the whole campaign in a single
        call: it delegates the campaign row to :meth:`create_campaign`, then
        upserts the 1:1 ``CampaignRule`` and ``CampaignReward`` from the (already
        shape-validated) ``rule``/``reward`` dicts. Nested dicts are optional — a
        draft may be incomplete; the publish gate (§23) is what enforces
        completeness. Returns the campaign re-fetched with its relations so
        ``getattr(campaign, "rule"/"reward")`` is fresh.
        """
        with transaction.atomic():
            campaign = cls.create_campaign(business, created_by, data)
            if rule is not None:
                CampaignRule.objects.create(campaign=campaign, **rule)
            if reward is not None:
                CampaignReward.objects.create(campaign=campaign, **reward)
        return Campaign.objects.select_related("rule", "reward").get(id=campaign.id)

    @classmethod
    def update_campaign_with_relations(
        cls,
        campaign: Campaign,
        business: Business,
        data: dict,
        rule: dict | None = None,
        reward: dict | None = None,
    ) -> Campaign:
        """Edit a draft campaign and upsert its rule/reward in one atomic block.

        Delegates the campaign-level edit (ownership + editable-state guard) to
        :meth:`update_campaign`, then updates-or-creates the 1:1 ``CampaignRule``
        and ``CampaignReward`` from the supplied dicts. Omitting a nested dict
        leaves that relation untouched. Returns the campaign re-fetched with its
        relations.
        """
        with transaction.atomic():
            campaign = cls.update_campaign(campaign, business, data)
            if rule is not None:
                CampaignRule.objects.update_or_create(
                    campaign=campaign, defaults=rule
                )
            if reward is not None:
                CampaignReward.objects.update_or_create(
                    campaign=campaign, defaults=reward
                )
        return Campaign.objects.select_related("rule", "reward").get(id=campaign.id)

    @staticmethod
    def _assert_publishable(campaign: Campaign) -> None:
        """Raise ``CAMPAIGN_NOT_PUBLISHABLE`` unless the campaign meets §23 rules.

        Requires a configured reward and, when both dates are set, ``end_at``
        strictly after ``start_at``, plus ``max_rewards >= 1`` when set. The rule
        requirement is type-aware (campaigns-restructure design §3):

        * INDIVIDUAL — a rule with ``required_count >= 1`` for VISIT/STAMP, or a
          positive ``required_spend`` for SPEND.
        * GROUP — a rule with ``required_group_size >= 2`` (a group needs members).
        * SOCIAL — no completion-rule fields (completion is staff-verified proof);
          only the reward is required.

        The reason detail names the first failed rule.
        """
        reward = getattr(campaign, "reward", None)
        if reward is None:
            raise JaqynAPIException(
                "CAMPAIGN_NOT_PUBLISHABLE",
                "A reward must be configured before publishing",
                status.HTTP_409_CONFLICT,
            )
        rule = getattr(campaign, "rule", None)
        if campaign.campaign_type == Campaign.CampaignType.INDIVIDUAL:
            mechanic = rule.mechanic if rule is not None else None
            if rule is None:
                raise JaqynAPIException(
                    "CAMPAIGN_NOT_PUBLISHABLE",
                    "A completion rule is needed",
                    status.HTTP_409_CONFLICT,
                )
            if mechanic == CampaignRule.Mechanic.SPEND:
                if not rule.required_spend or rule.required_spend <= 0:
                    raise JaqynAPIException(
                        "CAMPAIGN_NOT_PUBLISHABLE",
                        "A positive required spend is needed",
                        status.HTTP_409_CONFLICT,
                    )
            elif rule.required_count < 1:
                raise JaqynAPIException(
                    "CAMPAIGN_NOT_PUBLISHABLE",
                    "A completion rule with a required count is needed",
                    status.HTTP_409_CONFLICT,
                )
        elif campaign.campaign_type == Campaign.CampaignType.GROUP:
            if rule is None or not rule.required_group_size or rule.required_group_size < 2:
                raise JaqynAPIException(
                    "CAMPAIGN_NOT_PUBLISHABLE",
                    "A group size of at least two is needed",
                    status.HTTP_409_CONFLICT,
                )
        # SOCIAL: no completion-rule fields required (staff-verified proof).
        if (
            campaign.start_at is not None
            and campaign.end_at is not None
            and campaign.end_at <= campaign.start_at
        ):
            raise JaqynAPIException(
                "CAMPAIGN_NOT_PUBLISHABLE",
                "End must be after start",
                status.HTTP_409_CONFLICT,
            )
        if campaign.max_rewards is not None and campaign.max_rewards < 1:
            raise JaqynAPIException(
                "CAMPAIGN_NOT_PUBLISHABLE",
                "Reward cap must be at least one",
                status.HTTP_409_CONFLICT,
            )

    @classmethod
    def publish_campaign(
        cls, campaign: Campaign, business: Business, now: datetime | None = None
    ) -> Campaign:
        """Publish a draft, moving it to SCHEDULED or ACTIVE (plan §1.2 / §23).

        Verifies ownership and runs :meth:`_assert_publishable`. A campaign whose
        ``start_at`` is in the future goes to SCHEDULED (the lifecycle task flips
        it to ACTIVE at start); one with no future start goes straight to ACTIVE.
        Only a DRAFT may be published (``CAMPAIGN_INVALID_STATE`` otherwise).
        """
        now = now or timezone.now()
        cls._assert_owned(campaign, business)
        if campaign.status != Campaign.Status.DRAFT:
            raise JaqynAPIException(
                "CAMPAIGN_INVALID_STATE",
                "Only a draft campaign can be published",
                status.HTTP_409_CONFLICT,
            )
        cls._assert_publishable(campaign)

        if campaign.start_at is not None and campaign.start_at > now:
            campaign.status = Campaign.Status.SCHEDULED
        else:
            campaign.status = Campaign.Status.ACTIVE
        campaign.save(update_fields=["status", "updated_at"])
        emit_event(
            "campaign_published",
            business_id=str(business.id),
            campaign_id=str(campaign.id),
            status=campaign.status,
        )
        return campaign

    @classmethod
    def _transition(
        cls,
        campaign: Campaign,
        business: Business,
        allowed_from: set[str],
        new_status: str,
        event: str,
    ) -> Campaign:
        """Apply a guarded status transition (ownership + allowed-from check)."""
        cls._assert_owned(campaign, business)
        if campaign.status not in allowed_from:
            raise JaqynAPIException(
                "CAMPAIGN_INVALID_STATE", status_code=status.HTTP_409_CONFLICT
            )
        campaign.status = new_status
        campaign.save(update_fields=["status", "updated_at"])
        emit_event(
            event,
            business_id=str(business.id),
            campaign_id=str(campaign.id),
        )
        return campaign

    @classmethod
    def pause(cls, campaign: Campaign, business: Business) -> Campaign:
        """Pause an ACTIVE campaign (no visit counts while paused)."""
        return cls._transition(
            campaign,
            business,
            {Campaign.Status.ACTIVE},
            Campaign.Status.PAUSED,
            "campaign_paused",
        )

    @classmethod
    def resume(cls, campaign: Campaign, business: Business) -> Campaign:
        """Resume a PAUSED campaign back to ACTIVE."""
        return cls._transition(
            campaign,
            business,
            {Campaign.Status.PAUSED},
            Campaign.Status.ACTIVE,
            "campaign_resumed",
        )

    @classmethod
    def end(cls, campaign: Campaign, business: Business) -> Campaign:
        """End an ACTIVE/PAUSED/SCHEDULED campaign (no further visits count).

        Already-issued ACTIVE vouchers remain valid (plan Q5).
        """
        return cls._transition(
            campaign,
            business,
            {Campaign.Status.ACTIVE, Campaign.Status.PAUSED, Campaign.Status.SCHEDULED},
            Campaign.Status.ENDED,
            "campaign_ended",
        )

    @classmethod
    def cancel(cls, campaign: Campaign, business: Business) -> Campaign:
        """Cancel a campaign (plan Q5).

        Valid from DRAFT/SCHEDULED/ACTIVE/PAUSED. Cancelling stops new visits but
        does **not** revoke vouchers already issued — ACTIVE vouchers stay valid
        until they expire or a manager explicitly cancels one
        (``CampaignRewardService.cancel_voucher``).
        """
        return cls._transition(
            campaign,
            business,
            {
                Campaign.Status.DRAFT,
                Campaign.Status.SCHEDULED,
                Campaign.Status.ACTIVE,
                Campaign.Status.PAUSED,
            },
            Campaign.Status.CANCELLED,
            "campaign_cancelled",
        )

    # Maps the business-list ``?status=`` filter token to the underlying
    # ``Campaign.Status`` set. "active" is the live ACTIVE status; "draft" covers
    # the pre-publish DRAFT/SCHEDULED states; "completed" covers the terminal
    # ENDED/CANCELLED states. Source: campaigns-restructure design §5.
    _STATUS_FILTERS = {
        "active": [Campaign.Status.ACTIVE],
        "draft": [Campaign.Status.DRAFT, Campaign.Status.SCHEDULED],
        "completed": [Campaign.Status.ENDED, Campaign.Status.CANCELLED],
    }

    @classmethod
    def list_for_business(
        cls,
        business: Business,
        campaign_type: str | None = None,
        status_filter: str | None = None,
    ):
        """Return a business's campaigns, newest first, optionally filtered (§5).

        ``campaign_type`` (``individual``/``group``/``social``) restricts to that
        type; an unknown/absent value applies no type filter. ``status_filter``
        (``active``/``draft``/``completed``) maps to the underlying status set via
        :attr:`_STATUS_FILTERS`; an unknown/absent value applies no status filter.
        Both degrade gracefully so a bad query param never 400s the list.
        """
        qs = (
            Campaign.objects.filter(business=business)
            .select_related("rule", "reward", "business")
            .order_by("-created_at")
        )
        if campaign_type in Campaign.CampaignType.values:
            qs = qs.filter(campaign_type=campaign_type)
        if status_filter in cls._STATUS_FILTERS:
            qs = qs.filter(status__in=cls._STATUS_FILTERS[status_filter])
        return qs

    @staticmethod
    def get_for_business(campaign_id, business: Business) -> Campaign:
        """Load one of a business's campaigns with rule/reward, or raise (§1.2).

        Raises ``CAMPAIGN_NOT_FOUND`` when the campaign does not exist *or* is not
        owned by ``business`` — the two are deliberately indistinguishable so a
        business cannot probe another's campaign ids.
        """
        try:
            return (
                Campaign.objects.select_related("rule", "reward", "business")
                .get(id=campaign_id, business=business)
            )
        except Campaign.DoesNotExist:
            raise JaqynAPIException(
                "CAMPAIGN_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
            )

    @staticmethod
    def get_discoverable(campaign_id) -> Campaign:
        """Load one campaign for the customer detail screen with rule/reward.

        Raises ``CAMPAIGN_NOT_FOUND`` when the campaign does not exist. Visibility
        beyond existence (e.g. status) is the view's/serializer's concern; the
        customer detail screen shows a campaign's terms regardless of whether it is
        currently joinable.
        """
        try:
            return (
                Campaign.objects.select_related("rule", "reward", "business")
                .get(id=campaign_id)
            )
        except Campaign.DoesNotExist:
            raise JaqynAPIException(
                "CAMPAIGN_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
            )

    @staticmethod
    def participant_for(campaign: Campaign, customer) -> CampaignParticipant | None:
        """Return the customer's participant row for a campaign, or ``None``."""
        return CampaignParticipant.objects.filter(
            campaign=campaign, customer=customer
        ).first()

    @staticmethod
    def participants_for(campaign: Campaign):
        """Return a campaign's participant rows for the business list (queryset)."""
        return (
            CampaignParticipant.objects.filter(campaign=campaign)
            .select_related("customer", "campaign__rule")
            .order_by("-updated_at")
        )

    # The participant statuses that count as "joined / in progress" for the
    # ``joined=true`` filter — the "From places you go" set on the redesigned
    # customer campaigns page. Source: campaigns-redesign spec (carousel of the
    # customer's joined campaigns). COMPLETED/REDEEMED are intentionally excluded:
    # those have already paid out and belong in the wallet, not "in progress".
    _JOINED_FILTER_STATUSES = frozenset(
        {CampaignParticipant.Status.JOINED, CampaignParticipant.Status.IN_PROGRESS}
    )

    @classmethod
    def discover_for_customer(
        cls,
        customer,
        now: datetime | None = None,
        campaign_type: str | None = None,
        joined_only: bool = False,
    ):
        """Return ACTIVE campaigns a customer can currently discover (queryset).

        MVP discovery surfaces every ACTIVE campaign whose run window is open at
        ``now`` (``start_at``/``end_at`` bounds). The per-customer progress is
        layered on by the serializer/view, not here. Selects rule/reward/business
        to avoid N+1.

        Optional filters back the redesigned customer campaigns page:

        * ``campaign_type`` — when one of ``Campaign.CampaignType`` (``individual``
          / ``group`` / ``social``), restrict to that type. ``None`` or any
          unknown value is ignored (no filter applied) so a bad query param
          degrades gracefully rather than erroring.
        * ``joined_only`` — when ``True``, restrict to campaigns the requesting
          customer has a participant for whose status is JOINED or IN_PROGRESS
          (the "From places you go" / "In progress" set). COMPLETED/REDEEMED are
          excluded — those have paid out and live in the wallet.
        """
        now = now or timezone.now()
        qs = (
            Campaign.objects.filter(status=Campaign.Status.ACTIVE)
            .filter(models.Q(start_at__isnull=True) | models.Q(start_at__lte=now))
            .filter(models.Q(end_at__isnull=True) | models.Q(end_at__gt=now))
            .select_related("rule", "reward", "business")
            .order_by("-created_at")
        )
        # A one-time (ONCE) campaign the customer has already completed or
        # redeemed has paid out — drop it from discovery (it now lives in the
        # wallet). REPEATABLE campaigns stay visible so they can be earned again.
        # exclude() builds a NOT-EXISTS subquery, so this is one bounded query and
        # does not interfere with the joined_only filter join below.
        qs = qs.exclude(
            completion_limit_per_customer=Campaign.CompletionLimit.ONCE,
            participants__customer=customer,
            participants__status__in=[
                CampaignParticipant.Status.COMPLETED,
                CampaignParticipant.Status.REDEEMED,
            ],
        )
        if campaign_type in Campaign.CampaignType.values:
            qs = qs.filter(campaign_type=campaign_type)
        if joined_only:
            qs = qs.filter(
                participants__customer=customer,
                participants__status__in=cls._JOINED_FILTER_STATUSES,
            )
        return qs

    # Discover-filter tokens for the customer feed (campaigns-restructure §6).
    # "group" → GROUP campaigns; "neighborhood" → all (geo filtering is a later
    # phase, so it currently behaves like "all"); "ended" → recently ENDED
    # campaigns; "all"/unknown → the default active discover set.
    @classmethod
    def feed_for_customer(
        cls,
        customer,
        discover_filter: str = "all",
        now: datetime | None = None,
    ) -> tuple[list[Campaign], list[Campaign]]:
        """Return the ``(followed, discover)`` split for the customer feed (§6).

        ``followed`` is the customer's in-progress campaigns (JOINED/IN_PROGRESS
        participant) — the "From places you go" row. ``discover`` is the
        discoverable set, filtered by ``discover_filter``:

        * ``group`` — only GROUP campaigns from the active discover set.
        * ``neighborhood`` — same as ``all`` for now (geo filtering is a later
          phase); kept as a distinct token so the contract is stable.
        * ``ended`` — recently ENDED campaigns (so the feed can show "missed it").
        * ``all`` / unknown — the full active discover set.

        ``discover`` excludes campaigns already in ``followed`` so a row never
        appears twice. Both are materialised lists (the view paginates/serialises
        them) with rule/reward/business selected to avoid N+1.
        """
        now = now or timezone.now()
        followed = list(
            cls.discover_for_customer(customer, now=now, joined_only=True)
        )
        followed_ids = {c.id for c in followed}

        if discover_filter == "ended":
            discover_qs = (
                Campaign.objects.filter(status=Campaign.Status.ENDED)
                .select_related("rule", "reward", "business")
                .order_by("-updated_at")
            )
        else:
            campaign_type = (
                Campaign.CampaignType.GROUP if discover_filter == "group" else None
            )
            discover_qs = cls.discover_for_customer(
                customer, now=now, campaign_type=campaign_type
            )
        discover = [c for c in discover_qs if c.id not in followed_ids]
        return followed, discover

    @staticmethod
    def progress_context_for(customer, campaigns) -> CustomerProgressContext:
        """Build the per-customer progress lookup for a page of campaigns (no N+1).

        Given the requesting ``customer`` and the already-materialised
        ``campaigns`` for one page, runs exactly two bounded queries — the
        customer's participant rows for those campaigns, and the customer's ACTIVE
        vouchers for those campaigns — and returns a
        :class:`CustomerProgressContext` the list serializer reads from memory.
        This is what keeps the list ``my_progress`` field off the N+1 path:
        without it each row would re-query its participant and voucher. ``campaigns``
        must already be a concrete list (the paginated page), not a lazy queryset,
        so callers don't re-hit the DB per row.
        """
        campaign_ids = [c.id for c in campaigns]
        if not campaign_ids:
            return CustomerProgressContext()
        participants = {
            str(p.campaign_id): p
            for p in CampaignParticipant.objects.filter(
                customer=customer, campaign_id__in=campaign_ids
            )
        }
        active_voucher_ids: dict[str, str] = {}
        # Newest first so the last write wins == the most recent ACTIVE voucher,
        # mirroring CampaignProgressSerializer.get_voucher_id's single-row order.
        for campaign_id, voucher_id in (
            CampaignRewardVoucher.objects.filter(
                customer=customer,
                campaign_id__in=campaign_ids,
                status=CampaignRewardVoucher.Status.ACTIVE,
            )
            .order_by("-issued_at", "-created_at")
            .values_list("campaign_id", "id")
        ):
            active_voucher_ids.setdefault(str(campaign_id), str(voucher_id))
        return CustomerProgressContext(
            participants=participants, active_voucher_ids=active_voucher_ids
        )

    @staticmethod
    def run_lifecycle_transitions(now: datetime | None = None) -> dict[str, int]:
        """Advance campaigns by clock: SCHEDULED→ACTIVE and ACTIVE→ENDED.

        Idempotent batch used by the ``transition_campaign_lifecycle`` task.
        Flips SCHEDULED campaigns whose ``start_at`` has passed to ACTIVE, and
        ACTIVE/PAUSED/SCHEDULED campaigns whose ``end_at`` has passed to ENDED.
        Returns a count for each direction. Takes no per-row lock — the updates
        are status filters, so a concurrent manual transition is harmless.
        """
        now = now or timezone.now()
        with transaction.atomic():
            activated = Campaign.objects.filter(
                status=Campaign.Status.SCHEDULED,
                start_at__lte=now,
            ).filter(models.Q(end_at__isnull=True) | models.Q(end_at__gt=now)).update(
                status=Campaign.Status.ACTIVE, updated_at=now
            )
            ended = Campaign.objects.filter(
                status__in=[
                    Campaign.Status.ACTIVE,
                    Campaign.Status.PAUSED,
                    Campaign.Status.SCHEDULED,
                ],
                end_at__lte=now,
            ).update(status=Campaign.Status.ENDED, updated_at=now)
        return {"activated": activated, "ended": ended}

    @staticmethod
    def claim_campaigns_to_warn_ending(now: datetime | None = None) -> list[str]:
        """Claim ACTIVE campaigns due for an "ending soon" nudge (plan §1.4).

        Selects ACTIVE campaigns whose ``end_at`` falls inside the next
        ``CAMPAIGN_ENDING_WARNING_HOURS`` and that have not already been warned
        (``ending_warned_at`` is null), stamps ``ending_warned_at`` under a row lock
        in one atomic block, and returns their ids. Stamping while holding the lock
        makes the periodic ``notify_campaigns_ending_soon`` task idempotent: a
        repeated run claims nothing already warned, so a campaign's participants are
        nudged at most once. Campaigns already past ``end_at`` are excluded — the
        lifecycle task ends those.
        """
        now = now or timezone.now()
        horizon = now + timedelta(hours=CAMPAIGN_ENDING_WARNING_HOURS)
        with transaction.atomic():
            ids = list(
                Campaign.objects.select_for_update(skip_locked=True)
                .filter(
                    status=Campaign.Status.ACTIVE,
                    ending_warned_at__isnull=True,
                    end_at__gt=now,
                    end_at__lte=horizon,
                )
                .values_list("id", flat=True)
            )
            if ids:
                Campaign.objects.filter(id__in=ids).update(
                    ending_warned_at=now, updated_at=now
                )
        return [str(campaign_id) for campaign_id in ids]
