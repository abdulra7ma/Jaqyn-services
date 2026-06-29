from dataclasses import dataclass, field
from datetime import timedelta

from django.db.models import Avg, Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.loyalty.models import LoyaltyProgram, LoyaltyTransaction, LoyaltyVoucher

# "Recent growth" is measured over a rolling 30-day window — a calendar month
# proxy that the owner dashboard reports as new members "this month".
NEW_MEMBER_WINDOW_DAYS = 30
# The Analytics tab plots redemptions for the trailing week.
REDEMPTION_TREND_DAYS = 7


@dataclass(frozen=True)
class LoyaltyAnalytics:
    """The owner-facing headline statistics for a loyalty program."""

    members: int
    outstanding: int
    redeemed: int
    new_members_30d: int
    repeat_rate: float  # fraction (0–1) of members who earned more than once
    avg_basket: float  # average earn-transaction bill amount (0 if untracked)
    # redeemed-voucher counts for the trailing 7 days, oldest day first.
    redemptions_7d: list[int] = field(default_factory=list)


class LoyaltyAnalyticsService:
    """Compute compact program statistics from memberships and vouchers."""

    @staticmethod
    def for_program(program: LoyaltyProgram) -> LoyaltyAnalytics:
        """Return headline totals plus recent-growth and repeat-engagement rates.

        ``new_members_30d`` counts memberships joined within the rolling window;
        ``repeat_rate`` is the share of members with more than one earn
        transaction (a returning customer, not a one-time enrolment).
        """
        members = program.memberships.count()
        if program.type == LoyaltyProgram.Type.POINTS:
            outstanding = (
                program.memberships.aggregate(total=Sum("points_balance"))["total"] or 0
            )
        else:
            outstanding = LoyaltyVoucher.objects.filter(
                program=program, status=LoyaltyVoucher.Status.ACTIVE
            ).count()
        redeemed = LoyaltyVoucher.objects.filter(
            program=program, status=LoyaltyVoucher.Status.REDEEMED
        ).count()

        since = timezone.now() - timedelta(days=NEW_MEMBER_WINDOW_DAYS)
        new_members_30d = program.memberships.filter(joined_at__gte=since).count()

        repeat_members = (
            LoyaltyTransaction.objects.filter(
                program=program, kind=LoyaltyTransaction.Kind.EARN
            )
            .values("customer")
            .annotate(n=Count("id"))
            .filter(n__gt=1)
            .count()
        )
        repeat_rate = (repeat_members / members) if members else 0.0

        basket = LoyaltyTransaction.objects.filter(
            program=program,
            kind=LoyaltyTransaction.Kind.EARN,
            bill_amount__isnull=False,
        ).aggregate(a=Avg("bill_amount"))["a"]
        avg_basket = float(basket) if basket else 0.0

        # Trailing-week redemption trend, indexed oldest day → today.
        today = timezone.localdate()
        days = [today - timedelta(days=i) for i in range(REDEMPTION_TREND_DAYS - 1, -1, -1)]
        by_day = {
            row["d"]: row["n"]
            for row in (
                LoyaltyVoucher.objects.filter(
                    program=program,
                    status=LoyaltyVoucher.Status.REDEEMED,
                    redeemed_at__date__gte=days[0],
                )
                .annotate(d=TruncDate("redeemed_at"))
                .values("d")
                .annotate(n=Count("id"))
            )
        }
        redemptions_7d = [by_day.get(d, 0) for d in days]

        return LoyaltyAnalytics(
            members=members,
            outstanding=outstanding,
            redeemed=redeemed,
            new_members_30d=new_members_30d,
            repeat_rate=repeat_rate,
            avg_basket=avg_basket,
            redemptions_7d=redemptions_7d,
        )
