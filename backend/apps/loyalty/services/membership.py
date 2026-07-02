from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.db.models import QuerySet

from apps.accounts.models import User
from apps.loyalty.models import LoyaltyMembership, LoyaltyProgram


@dataclass(frozen=True)
class LoyaltyCardView:
    """Customer-facing state and reward summary for one ongoing program."""

    program_id: str
    business_id: str
    business_name: str
    business_logo_url: str | None
    # Owner-chosen wallet-card gradient name ("" = auto/hashed). Drives the card face color.
    business_card_accent: str
    business_category: str
    business_area: str
    # Day-of-week -> [open, close] map (Business.working_hours); the wallet detail
    # sheet picks a representative range to display.
    business_hours: dict[str, object]
    type: str
    name: str
    reward_summary: str
    # Days an earned reward stays valid (Business config). Shown on the detail
    # sheet's "Expires" row; cashback balances don't expire, so the UI renders
    # "No expiry" for points cards regardless of this value.
    reward_expiry_days: int
    joined: bool
    stamps_count: int
    visits_count: int
    required_count: int | None
    points_balance: int
    points_per_som: Decimal | None
    cashback_per_point: Decimal | None
    pct_back: Decimal | None


class LoyaltyMembershipService:
    """Own membership creation and customer-card projections."""

    @staticmethod
    def get_or_create_membership(
        program: LoyaltyProgram, customer: User
    ) -> tuple[LoyaltyMembership, bool]:
        """Return the unique card, creating its zero-balance row idempotently."""
        return LoyaltyMembership.objects.get_or_create(
            program=program, customer=customer
        )

    @staticmethod
    def card_view(
        program: LoyaltyProgram,
        customer: User,
        membership: LoyaltyMembership | None = None,
    ) -> LoyaltyCardView:
        """Project program config plus optional customer state without creating a card."""
        if membership is None:
            membership = LoyaltyMembership.objects.filter(
                program=program, customer=customer
            ).first()
        pct_back = None
        if (
            program.points_per_som is not None
            and program.cashback_per_point is not None
        ):
            # Multiplying the earn and redemption rates gives the effective cashback fraction.
            pct_back = (
                program.points_per_som * program.cashback_per_point * Decimal("100")
            )
        logo_url = program.business.logo.url if program.business.logo else None
        return LoyaltyCardView(
            program_id=str(program.id),
            business_id=str(program.business_id),
            business_name=program.business.name,
            business_logo_url=logo_url,
            business_card_accent=program.business.card_accent or "",
            business_category=program.business.category or "",
            business_area=program.business.area or "",
            business_hours=program.business.working_hours or {},
            type=program.type,
            name=program.name,
            reward_summary=program.reward_title
            or ("Cashback" if program.type == LoyaltyProgram.Type.POINTS else "Reward"),
            reward_expiry_days=program.reward_expiry_days,
            joined=membership is not None,
            stamps_count=membership.stamps_count if membership else 0,
            visits_count=membership.visits_count if membership else 0,
            required_count=program.required_count,
            points_balance=membership.points_balance if membership else 0,
            points_per_som=program.points_per_som,
            cashback_per_point=program.cashback_per_point,
            pct_back=pct_back,
        )

    @staticmethod
    def cards_for_customer(customer: User) -> list[LoyaltyCardView]:
        """Return all joined cards with program and business loaded in two queries."""
        memberships: QuerySet[LoyaltyMembership] = LoyaltyMembership.objects.filter(
            customer=customer
        ).select_related("program__business")
        return [
            LoyaltyMembershipService.card_view(row.program, customer, row)
            for row in memberships
        ]

    @staticmethod
    def rows_for_business_customer(
        business: object, customer: User
    ) -> list[LoyaltyCardView]:
        """Return every active business program, including unjoined zero-state cards."""
        programs = LoyaltyProgram.objects.filter(
            business=business, status=LoyaltyProgram.Status.ACTIVE
        ).select_related("business")
        memberships = {
            m.program_id: m
            for m in LoyaltyMembership.objects.filter(
                customer=customer, program__in=programs
            )
        }
        return [
            LoyaltyMembershipService.card_view(
                program, customer, memberships.get(program.id)
            )
            for program in programs
        ]
