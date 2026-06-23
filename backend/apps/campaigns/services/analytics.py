"""Campaign metric roll-ups (plan §1.2 / §8.2).

Computes the headline numbers shown on a campaign's business-side detail screen.
Returns a typed :class:`CampaignMetrics` dataclass — never a bare dict — so the
serializer and any caller depend on a stable, documented shape.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.db.models import Count, Q

from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignRewardVoucher,
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


class CampaignAnalyticsService:
    """Compute campaign metrics on read (plan §1.2).

    MVP computes everything from the participant/voucher tables on demand; hot
    counters can be denormalised later without changing this surface.
    """

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
