from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
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

# Bishkek is UTC+6, no DST. Used for ISO-week bucketing. Source: see patches/
# services/progress.py for the same constant and rationale.
import datetime as _dt
_BISHKEK_TZ = _dt.timezone(_dt.timedelta(hours=6))


@dataclass(frozen=True)
class LoyaltyHomeSummary:
    """Retention signals shown on the customer's home screen."""

    visit_streak_days: int
    streak_active_today: bool
    featured_campaign_ids: tuple[str, ...]
    rewards_earned: int
    som_saved: Decimal
    active_cards: int
    # Consecutive ISO-weeks ending now where the customer had ≥1 earn transaction.
    # Added per spec §B "add visit_streak_weeks to summary". Weeks are in Bishkek
    # local time so the result matches the customer's experience.
    visit_streak_weeks: int


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

        visit_streak_weeks = LoyaltyHomeService._build_week_streak(customer)

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
            visit_streak_weeks=visit_streak_weeks,
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
                visit_streak_weeks=0,
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
            visit_streak_weeks=0,
        )

    @staticmethod
    def _build_week_streak(customer: User) -> int:
        """Count consecutive ISO-weeks ending now where the customer had ≥1 visit.

        Uses Bishkek local time (UTC+6) for week assignment so the result matches
        what the customer sees. An ISO-week counts as having a visit if there is at
        least one EARN transaction in that week. The streak walks backward from the
        current ISO-week; the first week with no visits breaks it.
        Source: spec §B "add visit_streak_weeks (consecutive ISO-weeks ending now
        with ≥1 visit, computed in LoyaltyHomeService next to days)".
        """
        earn_datetimes = list(
            LoyaltyTransaction.objects.filter(
                customer=customer,
                kind=LoyaltyTransaction.Kind.EARN,
            )
            .values_list("created_at", flat=True)
            .order_by("created_at")
        )

        weeks_with_visit: set[tuple[int, int]] = set()
        for utc_dt in earn_datetimes:
            local_dt = utc_dt.astimezone(_BISHKEK_TZ)
            iso_cal = local_dt.isocalendar()
            weeks_with_visit.add((iso_cal[0], iso_cal[1]))

        now_local = timezone.now().astimezone(_BISHKEK_TZ)
        cur_iso = now_local.isocalendar()
        check_year, check_week = cur_iso[0], cur_iso[1]
        streak = 0

        for _ in range(200):  # bound the walk; 200 weeks ≈ 4 years
            if (check_year, check_week) in weeks_with_visit:
                streak += 1
                monday = datetime.fromisocalendar(check_year, check_week, 1)
                prev_monday = monday - timedelta(days=7)
                prev_iso = prev_monday.isocalendar()
                check_year, check_week = prev_iso[0], prev_iso[1]
            else:
                break

        return streak
