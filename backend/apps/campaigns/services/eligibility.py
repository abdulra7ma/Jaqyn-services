"""Campaign eligibility pipeline (plan §13).

A pure, side-effect-free set of checks that decide whether a given customer may
have a visit counted toward a campaign *right now*. The pipeline returns a
structured :class:`EligibilityResult` (never a bare dict) so callers can branch
on a typed ``reason`` rather than parsing strings.

The checks intentionally hold no transaction and write nothing: they are run both
by the staff-scan surface (to list eligible campaigns) and by
``CampaignProgressService.record_campaign_action`` (inside its locked block) as
the gate before incrementing progress.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from django.utils import timezone

from apps.campaigns.constants import DEFAULT_MIN_MINUTES_BETWEEN_ACTIONS
from apps.campaigns.models import (
    Campaign,
    CampaignAction,
    CampaignParticipant,
    CampaignRewardVoucher,
)


class IneligibilityReason(str, Enum):
    """Typed reason a campaign visit is not eligible (plan §13).

    The value doubles as the error code raised by the progress service when an
    ineligible action is attempted, so each member maps to a key in
    ``core.exceptions.ERROR_MESSAGES``.
    """

    NOT_ACTIVE = "CAMPAIGN_NOT_ACTIVE"
    OUTSIDE_WINDOW = "CAMPAIGN_OUTSIDE_WINDOW"
    PARTICIPANT_LIMIT = "CAMPAIGN_FULL"
    ALREADY_COMPLETED = "CAMPAIGN_ALREADY_COMPLETED"
    DAILY_LIMIT = "CAMPAIGN_DAILY_LIMIT_REACHED"
    MIN_GAP = "CAMPAIGN_MIN_GAP"
    REWARD_LIMIT = "CAMPAIGN_REWARD_LIMIT_REACHED"


@dataclass(frozen=True)
class EligibilityResult:
    """Outcome of running the eligibility pipeline for one campaign.

    ``eligible`` is the single source of truth; ``reason`` is populated only when
    ``eligible`` is ``False`` and is one of :class:`IneligibilityReason`.
    ``campaign`` is echoed back so a caller iterating many campaigns keeps the
    association without a second lookup.
    """

    campaign: Campaign
    eligible: bool
    reason: IneligibilityReason | None = None

    @property
    def reason_code(self) -> str | None:
        """Error code for the reason, or ``None`` when eligible."""
        return self.reason.value if self.reason is not None else None


class CampaignEligibilityService:
    """Stateless pipeline of campaign eligibility checks (plan §13).

    Every method is a pure predicate over campaign/participant state and the
    current time. The service writes nothing and takes no lock; the caller that
    mutates progress is responsible for locking and for re-running the pipeline
    inside its transaction.
    """

    @staticmethod
    def check_campaign_active(campaign: Campaign) -> bool:
        """Return ``True`` when the campaign is in the ACTIVE status.

        DRAFT/SCHEDULED/PAUSED/ENDED/CANCELLED campaigns never count a visit.
        """
        return campaign.status == Campaign.Status.ACTIVE

    @staticmethod
    def check_date_time_window(campaign: Campaign, now: datetime) -> bool:
        """Return ``True`` when ``now`` falls inside the campaign's run window.

        Enforces, in order: ``start_at`` (inclusive) and ``end_at`` (exclusive)
        if set; weekday membership in ``active_days`` (list of Python weekday
        ints, Monday=0) when that list is non-empty; and the local
        ``active_start_time``/``active_end_time`` clock window. An empty
        ``active_days`` means every day; the default 00:00–23:59 time window
        means all day.
        """
        if campaign.start_at is not None and now < campaign.start_at:
            return False
        if campaign.end_at is not None and now >= campaign.end_at:
            return False
        if campaign.active_days and now.weekday() not in campaign.active_days:
            return False
        current_time = now.timetz().replace(tzinfo=None) if now.tzinfo else now.time()
        if not (campaign.active_start_time <= current_time <= campaign.active_end_time):
            return False
        return True

    @staticmethod
    def check_branch(campaign: Campaign) -> bool:
        """Branch-scope check — a no-op in MVP (plan D5/Q1).

        No Branch entity exists; a campaign belongs to one Business and is valid
        at that business. Always ``True``; kept as a named seam so the pipeline
        reads the same once branch scoping lands (Phase 3).
        """
        return True

    @staticmethod
    def check_customer_eligibility(
        campaign: Campaign, participant: CampaignParticipant | None
    ) -> bool:
        """Return ``True`` when the customer may still progress this campaign.

        A ONCE campaign rejects a participant already in COMPLETED/REDEEMED
        (they have had their single completion). A REPEATABLE campaign always
        passes this check — the same participant row is re-used across cycles.
        A customer with no participant row yet always passes (they will be
        auto-joined).
        """
        if participant is None:
            return True
        if (
            campaign.completion_limit_per_customer
            == Campaign.CompletionLimit.REPEATABLE
        ):
            return True
        completed_states = {
            CampaignParticipant.Status.COMPLETED,
            CampaignParticipant.Status.REDEEMED,
        }
        return participant.status not in completed_states

    @staticmethod
    def check_participant_limit(campaign: Campaign) -> bool:
        """Return ``True`` when the campaign is under its ``max_participants`` cap.

        ``max_participants`` of ``None`` means unlimited. Counts distinct
        participant rows for the campaign.
        """
        if campaign.max_participants is None:
            return True
        joined = CampaignParticipant.objects.filter(campaign=campaign).count()
        return joined < campaign.max_participants

    @staticmethod
    def check_daily_limit(campaign: Campaign, customer_id, now: datetime) -> bool:
        """Return ``True`` when the customer is under the campaign's per-day cap.

        The cap lives on ``CampaignRule.max_count_per_day``; ``None`` means no
        daily cap. Counts COUNTED actions for this (campaign, customer) since the
        start of the current UTC day.
        """
        rule = getattr(campaign, "rule", None)
        if rule is None or rule.max_count_per_day is None:
            return True
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        counted_today = CampaignAction.objects.filter(
            campaign=campaign,
            customer_id=customer_id,
            status=CampaignAction.Status.COUNTED,
            action_time__gte=day_start,
        ).count()
        return counted_today < rule.max_count_per_day

    @staticmethod
    def check_min_time_between_visits(
        campaign: Campaign, customer_id, now: datetime
    ) -> bool:
        """Return ``True`` when enough time has passed since the last counted visit.

        The minimum gap is ``CampaignRule.minimum_time_between_actions`` when set,
        otherwise ``DEFAULT_MIN_MINUTES_BETWEEN_ACTIONS`` minutes. Guards a single
        sitting from being counted twice (anti-fraud min-interval, plan §13/§15).
        """
        from datetime import timedelta

        rule = getattr(campaign, "rule", None)
        if rule is not None and rule.minimum_time_between_actions is not None:
            min_gap = rule.minimum_time_between_actions
        else:
            # No per-rule gap configured → fall back to the app-wide default so a
            # back-to-back scan within the hour does not double-count.
            min_gap = timedelta(minutes=DEFAULT_MIN_MINUTES_BETWEEN_ACTIONS)
        last = (
            CampaignAction.objects.filter(
                campaign=campaign,
                customer_id=customer_id,
                status=CampaignAction.Status.COUNTED,
            )
            .order_by("-action_time")
            .values_list("action_time", flat=True)
            .first()
        )
        if last is None:
            return True
        return (now - last) >= min_gap

    @staticmethod
    def check_reward_limit(campaign: Campaign) -> bool:
        """Return ``True`` when the campaign can still issue another reward.

        The cap is ``Campaign.max_rewards``; ``None`` means unlimited. Counts
        vouchers that consumed an allotment — ACTIVE, REDEEMED, or EXPIRED.
        CANCELLED vouchers do not count against the cap (a cancelled reward frees
        its slot, plan §1.2 / Q5).
        """
        if campaign.max_rewards is None:
            return True
        consumed = (
            CampaignRewardVoucher.objects.filter(campaign=campaign)
            .exclude(status=CampaignRewardVoucher.Status.CANCELLED)
            .count()
        )
        return consumed < campaign.max_rewards

    @classmethod
    def evaluate(
        cls,
        campaign: Campaign,
        customer_id,
        participant: CampaignParticipant | None = None,
        now: datetime | None = None,
    ) -> EligibilityResult:
        """Run the full §13 pipeline and return a structured result.

        Checks run in cheap-to-expensive order and short-circuit on the first
        failure. The order is: active → date/time window → participant limit →
        customer (completion) eligibility → daily limit → min-gap → reward limit.
        ``check_branch`` is folded in as a no-op for MVP. Returns an
        :class:`EligibilityResult`; never raises and never writes.

        Campaigns are visit/action-count challenges; durable points, stamps, and
        spend balances are evaluated by apps.loyalty.
        """
        now = now or timezone.now()

        if not cls.check_campaign_active(campaign):
            return EligibilityResult(campaign, False, IneligibilityReason.NOT_ACTIVE)
        if not cls.check_date_time_window(campaign, now):
            return EligibilityResult(
                campaign, False, IneligibilityReason.OUTSIDE_WINDOW
            )
        if not cls.check_branch(campaign):  # no-op in MVP
            return EligibilityResult(
                campaign, False, IneligibilityReason.OUTSIDE_WINDOW
            )
        if participant is None and not cls.check_participant_limit(campaign):
            return EligibilityResult(
                campaign, False, IneligibilityReason.PARTICIPANT_LIMIT
            )

        if not cls.check_customer_eligibility(campaign, participant):
            return EligibilityResult(
                campaign, False, IneligibilityReason.ALREADY_COMPLETED
            )
        if not cls.check_daily_limit(campaign, customer_id, now):
            return EligibilityResult(campaign, False, IneligibilityReason.DAILY_LIMIT)
        if not cls.check_min_time_between_visits(campaign, customer_id, now):
            return EligibilityResult(campaign, False, IneligibilityReason.MIN_GAP)
        if not cls.check_reward_limit(campaign):
            return EligibilityResult(campaign, False, IneligibilityReason.REWARD_LIMIT)

        return EligibilityResult(campaign, True, None)

    @classmethod
    def eligible_campaigns_for_customer(
        cls, business, customer_id, now: datetime | None = None
    ) -> list[EligibilityResult]:
        """Return one :class:`EligibilityResult` per active INDIVIDUAL/SOCIAL campaign at a business.

        Used by the staff-scan surface to surface every campaign the customer
        could progress (and the reason for any that are blocked). Prefetches the
        rule, the reward, and the customer's participant rows to keep the
        per-campaign checks and the staff-chooser row fields free of N+1 queries.

        GROUP campaigns are excluded: they complete only via the confirm-group
        flow (staff scans the group's invite QR), never via the per-customer
        chooser. Showing a GROUP row in the chooser would mislead staff into
        tapping ``confirm-visit`` for a flow that requires ``confirm-group``.
        """
        now = now or timezone.now()
        campaigns = list(
            Campaign.objects.filter(
                business=business,
                status=Campaign.Status.ACTIVE,
            )
            # ponytail: exclude GROUP at query time — one extra filter beats
            # post-filtering a large list or hiding ineligible rows in the FE.
            .exclude(campaign_type=Campaign.CampaignType.GROUP)
            .select_related("rule", "reward")
        )
        participant_by_campaign = {
            p.campaign_id: p
            for p in CampaignParticipant.objects.filter(
                campaign__in=campaigns, customer_id=customer_id
            )
        }
        results: list[EligibilityResult] = []
        for campaign in campaigns:
            participant = participant_by_campaign.get(campaign.id)
            results.append(cls.evaluate(campaign, customer_id, participant, now))
        return results
