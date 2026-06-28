from dataclasses import dataclass

from django.db.models import Sum

from apps.loyalty.models import LoyaltyProgram, LoyaltyVoucher


@dataclass(frozen=True)
class LoyaltyAnalytics:
    """The three owner-facing headline statistics for a loyalty program."""

    members: int
    outstanding: int
    redeemed: int


class LoyaltyAnalyticsService:
    """Compute compact program statistics from memberships and vouchers."""

    @staticmethod
    def for_program(program: LoyaltyProgram) -> LoyaltyAnalytics:
        """Return member, outstanding-value, and redeemed-voucher totals."""
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
        return LoyaltyAnalytics(
            members=members, outstanding=outstanding, redeemed=redeemed
        )
