"""Campaign metric roll-ups (plan §1.2 / §8.2).

Computes the headline numbers shown on a campaign's business-side detail screen.
Returns a typed :class:`CampaignMetrics` dataclass — never a bare dict — so the
serializer and any caller depend on a stable, documented shape.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.db.models import Count, Q

from django.db.models import Sum

from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignRewardVoucher,
    Group,
    GroupMember,
)


@dataclass(frozen=True)
class CampaignMetrics:
    """Headline metrics for one campaign's detail screen (plan §8.2).

    Counts are participant/voucher roll-ups. ``redemption_rate`` is redeemed /
    issued in the range 0.0–1.0 (0.0 when nothing has been issued).
    ``estimated_cost`` is ``issued`` times the reward's ``estimated_cost`` (an
    exact ``Decimal``, never a float). ``new_vs_returning`` splits joiners by
    whether the campaign was their first participation at the business.
    """

    campaign_id: str
    views: int
    joined: int
    active: int
    completed: int
    issued: int
    redeemed: int
    expired: int
    cancelled: int
    redemption_rate: float
    estimated_cost: Decimal
    new_customers: int
    returning_customers: int


# Fraction of required progress at/above which a participant is "close to reward".
# 0.8 = within the last 20% of a campaign's required count. Source:
# campaigns-restructure plan §1.5 (Individual: close_to_reward = participants ≥ 80%).
_CLOSE_TO_REWARD_RATIO = 0.8


@dataclass(frozen=True)
class CampaignTypeStats:
    """The three type-specific headline stats shown on a campaign card (§1.5).

    Exactly three numbers, their meaning fixed by ``campaign_type``:

    * **INDIVIDUAL** — ``stat_a`` enrolled, ``stat_b`` redeemed, ``stat_c``
      close-to-reward (participants ≥ 80% of required progress).
    * **GROUP** — ``stat_a`` groups created, ``stat_b`` customers joined,
      ``stat_c`` redeemed.
    * **SOCIAL** — ``stat_a`` joined, ``stat_b`` redeemed, ``stat_c`` reach
      (sum of self-entered ``follower_count``).

    ``labels`` maps each slot to its human label so a caller renders the triplet
    without re-deriving the meaning from the type.
    """

    campaign_id: str
    campaign_type: str
    stat_a: int
    stat_b: int
    stat_c: int
    labels: dict[str, str]


class CampaignAnalyticsService:
    """Compute campaign metrics on read (plan §1.2).

    MVP computes everything from the participant/voucher tables on demand; hot
    counters can be denormalised later without changing this surface.
    """

    @staticmethod
    def type_stats(campaign: Campaign) -> CampaignTypeStats:
        """Return the three type-specific headline stats for a campaign (§1.5).

        Branches on ``campaign.campaign_type`` and returns a
        :class:`CampaignTypeStats` triplet (never a bare dict). Each branch uses
        aggregate queries only — no per-row loop / N+1:

        * INDIVIDUAL: enrolled (all participants), redeemed (REDEEMED vouchers),
          close_to_reward (participants whose ``progress_count`` is ≥ 80% of the
          rule's ``required_count``; 0 when no required count is set).
        * GROUP: groups_created, customers_joined (group members), redeemed.
        * SOCIAL: joined, redeemed, reach (sum of participant ``follower_count``).
        """
        ctype = campaign.campaign_type
        redeemed = CampaignRewardVoucher.objects.filter(
            campaign=campaign, status=CampaignRewardVoucher.Status.REDEEMED
        ).count()

        if ctype == Campaign.CampaignType.GROUP:
            groups_created = Group.objects.filter(campaign=campaign).count()
            customers_joined = GroupMember.objects.filter(
                group__campaign=campaign
            ).count()
            return CampaignTypeStats(
                campaign_id=str(campaign.id),
                campaign_type=ctype,
                stat_a=groups_created,
                stat_b=customers_joined,
                stat_c=redeemed,
                labels={
                    "stat_a": "Groups created",
                    "stat_b": "Customers joined",
                    "stat_c": "Redeemed",
                },
            )

        if ctype == Campaign.CampaignType.SOCIAL:
            joined = CampaignParticipant.objects.filter(campaign=campaign).count()
            reach = (
                CampaignParticipant.objects.filter(campaign=campaign).aggregate(
                    reach=Sum("follower_count")
                )["reach"]
                or 0
            )
            return CampaignTypeStats(
                campaign_id=str(campaign.id),
                campaign_type=ctype,
                stat_a=joined,
                stat_b=redeemed,
                stat_c=reach,
                labels={
                    "stat_a": "Joined",
                    "stat_b": "Redeemed",
                    "stat_c": "Reach",
                },
            )

        # INDIVIDUAL (default).
        enrolled = CampaignParticipant.objects.filter(campaign=campaign).count()
        rule = getattr(campaign, "rule", None)
        required = rule.required_count if rule is not None else 0
        close_to_reward = 0
        if required:
            threshold = required * _CLOSE_TO_REWARD_RATIO
            close_to_reward = (
                CampaignParticipant.objects.filter(
                    campaign=campaign,
                    progress_count__gte=threshold,
                )
                .exclude(
                    status__in=[
                        CampaignParticipant.Status.COMPLETED,
                        CampaignParticipant.Status.REDEEMED,
                    ]
                )
                .count()
            )
        return CampaignTypeStats(
            campaign_id=str(campaign.id),
            campaign_type=ctype,
            stat_a=enrolled,
            stat_b=redeemed,
            stat_c=close_to_reward,
            labels={
                "stat_a": "Enrolled",
                "stat_b": "Redeemed",
                "stat_c": "Close to reward",
            },
        )

    @staticmethod
    def campaign_metrics(campaign: Campaign) -> CampaignMetrics:
        """Return a :class:`CampaignMetrics` for one campaign (plan §8.2).

        ``views`` is not yet tracked in MVP and is reported as 0 (the auto-join
        link view counter is Phase 2). ``joined`` counts all participant rows;
        ``active`` counts JOINED/IN_PROGRESS; ``completed`` counts
        COMPLETED/REDEEMED. Voucher counts are grouped by status. ``new`` vs
        ``returning`` is decided by whether each joiner has an earlier
        participation in any campaign of the same business. All counts use
        aggregate queries (no per-row loop / N+1).
        """
        participant_stats = CampaignParticipant.objects.filter(
            campaign=campaign
        ).aggregate(
            joined=Count("id"),
            active=Count(
                "id",
                filter=Q(
                    status__in=[
                        CampaignParticipant.Status.JOINED,
                        CampaignParticipant.Status.IN_PROGRESS,
                    ]
                ),
            ),
            completed=Count(
                "id",
                filter=Q(
                    status__in=[
                        CampaignParticipant.Status.COMPLETED,
                        CampaignParticipant.Status.REDEEMED,
                    ]
                ),
            ),
        )

        voucher_stats = CampaignRewardVoucher.objects.filter(
            campaign=campaign
        ).aggregate(
            issued=Count("id"),
            redeemed=Count(
                "id", filter=Q(status=CampaignRewardVoucher.Status.REDEEMED)
            ),
            expired=Count("id", filter=Q(status=CampaignRewardVoucher.Status.EXPIRED)),
            cancelled=Count(
                "id", filter=Q(status=CampaignRewardVoucher.Status.CANCELLED)
            ),
        )

        issued = voucher_stats["issued"] or 0
        redeemed = voucher_stats["redeemed"] or 0
        redemption_rate = (redeemed / issued) if issued else 0.0

        reward = getattr(campaign, "reward", None)
        unit_cost = (
            reward.estimated_cost
            if reward is not None and reward.estimated_cost is not None
            else Decimal("0")
        )
        estimated_cost = unit_cost * issued

        new_customers, returning_customers = (
            CampaignAnalyticsService._new_vs_returning(campaign)
        )

        return CampaignMetrics(
            campaign_id=str(campaign.id),
            views=0,  # view tracking is Phase 2 (auto-join link counter)
            joined=participant_stats["joined"] or 0,
            active=participant_stats["active"] or 0,
            completed=participant_stats["completed"] or 0,
            issued=issued,
            redeemed=redeemed,
            expired=voucher_stats["expired"] or 0,
            cancelled=voucher_stats["cancelled"] or 0,
            redemption_rate=round(redemption_rate, 4),
            estimated_cost=estimated_cost,
            new_customers=new_customers,
            returning_customers=returning_customers,
        )

    @staticmethod
    def _new_vs_returning(campaign: Campaign) -> tuple[int, int]:
        """Split a campaign's joiners into new vs returning for the business.

        A joiner is "returning" when they participated in any campaign of the same
        business *before* joining this one; otherwise "new". Uses two aggregate
        queries (no N+1): the set of customers who joined this campaign and the
        set of those with an earlier participation at the business.
        """
        joiner_ids = set(
            CampaignParticipant.objects.filter(campaign=campaign).values_list(
                "customer_id", flat=True
            )
        )
        if not joiner_ids:
            return 0, 0
        returning_ids = set(
            CampaignParticipant.objects.filter(
                campaign__business_id=campaign.business_id,
                customer_id__in=joiner_ids,
            )
            .exclude(campaign=campaign)
            .values_list("customer_id", flat=True)
        )
        returning = len(joiner_ids & returning_ids)
        new = len(joiner_ids) - returning
        return new, returning
