from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.accounts.models import User
from apps.loyalty.models import (
    LoyaltyMembership,
    LoyaltyProgram,
    LoyaltyTransaction,
    LoyaltyVoucher,
)


@dataclass(frozen=True)
class LoyaltyHomeSummary:
    """Retention signals shown on the customer's home screen."""

    visit_streak_days: int
    streak_active_today: bool
    featured_campaign_ids: tuple[str, ...]
    rewards_earned: int
    som_saved: Decimal
    active_cards: int


class LoyaltyHomeService:
    """Build customer-home loyalty signals from the immutable earn ledger."""

    @staticmethod
    def summary_for_customer(customer: User) -> LoyaltyHomeSummary:
        """Return customer streak, reward totals, savings, and active cards.

        An earn transaction counts as a visit day. A streak remains current when
        its latest visit is today or yesterday, giving the customer until the end
        of today to continue it. Older sequences are not presented as active.
        Cancelled rewards are excluded; savings count redeemed cashback plus
        redeemed campaign rewards with a configured estimated cost.
        """

        today = timezone.localdate()
        visit_days = list(
            LoyaltyTransaction.objects.filter(
                customer=customer,
                kind=LoyaltyTransaction.Kind.EARN,
            )
            .annotate(
                visit_day=TruncDate(
                    "created_at", tzinfo=timezone.get_current_timezone()
                )
            )
            .values_list("visit_day", flat=True)
            .distinct()
            .order_by("-visit_day")
        )
        streak = LoyaltyHomeService._build_streak(visit_days, today)
        # The campaigns service owns ranking; this service only composes the
        # customer-home response at the public domain boundary.
        from apps.campaigns.services import CampaignService

        loyalty_totals = LoyaltyVoucher.objects.filter(customer=customer).aggregate(
            rewards_earned=Count(
                "id", filter=~Q(status=LoyaltyVoucher.Status.CANCELLED)
            ),
            som_saved=Sum(
                "cashback_amount",
                filter=Q(status=LoyaltyVoucher.Status.REDEEMED),
            ),
        )
        campaign_totals = CampaignService.customer_reward_metrics(customer)
        active_cards = LoyaltyMembership.objects.filter(
            customer=customer,
            program__status=LoyaltyProgram.Status.ACTIVE,
        ).count()

        return LoyaltyHomeSummary(
            visit_streak_days=streak.visit_streak_days,
            streak_active_today=streak.streak_active_today,
            featured_campaign_ids=tuple(CampaignService.home_priority_ids(customer)),
            rewards_earned=(
                loyalty_totals["rewards_earned"] + campaign_totals.rewards_earned
            ),
            som_saved=(loyalty_totals["som_saved"] or Decimal("0"))
            + campaign_totals.som_saved,
            active_cards=active_cards,
        )

    @staticmethod
    def _build_streak(visit_days: list[date], today: date) -> LoyaltyHomeSummary:
        """Count consecutive dates when the latest visit is today or yesterday."""

        if not visit_days or visit_days[0] < today - timedelta(days=1):
            return LoyaltyHomeSummary(
                visit_streak_days=0,
                streak_active_today=False,
                featured_campaign_ids=(),
                rewards_earned=0,
                som_saved=Decimal("0"),
                active_cards=0,
            )

        expected = visit_days[0]
        streak = 0
        for visit_day in visit_days:
            if visit_day != expected:
                break
            streak += 1
            expected -= timedelta(days=1)

        return LoyaltyHomeSummary(
            visit_streak_days=streak,
            streak_active_today=visit_days[0] == today,
            featured_campaign_ids=(),
            rewards_earned=0,
            som_saved=Decimal("0"),
            active_cards=0,
        )
