from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional

from django.db.models import QuerySet

from apps.accounts.models import User
from apps.loyalty.models import LoyaltyMembership, LoyaltyProgram

from .tiers import LoyaltyTierService


@dataclass(frozen=True)
class LoyaltyTierView:
    """One rung of a program's cashback status ladder, as shown to customers."""

    name: str
    min_visits: int
    cashback_percent: Decimal


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
    # Most recent earn/redeem activity. Home uses this as the final tie-breaker
    # after reward proximity so the same card order is stable across requests.
    last_activity_at: datetime | None
    joined: bool
    stamps_count: int
    visits_count: int
    required_count: int | None
    points_balance: int
    # Owner-configured minimum balance required before cashback redemption.
    min_redeem_points: int | None
    points_per_som: Decimal | None
    cashback_per_point: Decimal | None
    pct_back: Decimal | None
    # Cashback status ladder (empty when the program has none) plus the
    # customer's standing on it: current status name, the next rung, and how
    # many visits remain to reach it (None at the top or off-ladder).
    tiers: list[LoyaltyTierView]
    current_tier_name: str | None
    next_tier_name: str | None
    next_tier_visits_left: int | None
    # Business geo-coordinates, exposed so the client (which owns geolocation
    # permission) can compute distance labels like "120 m". Nullable — many
    # businesses are not yet geo-tagged. Source: spec §B lat/lng exposure.
    business_lat: Optional[Decimal]
    business_lng: Optional[Decimal]


@dataclass(frozen=True)
class WalletJoinResult:
    """Memberships present after a join and how many were newly created."""

    memberships: list[LoyaltyMembership]
    created_count: int


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
    def join_active_programs_for_business(
        business: object, customer: User
    ) -> WalletJoinResult:
        """Add every active card offered by a business to a customer's wallet.

        Campaign joins use this cross-service entry point so the durable wallet is
        populated in the same transaction. Existing memberships are returned
        unchanged, making repeated campaign joins and shops with several campaigns
        idempotent.
        """
        programs = list(
            LoyaltyProgram.objects.filter(
                business=business, status=LoyaltyProgram.Status.ACTIVE
            ).order_by("created_at", "id")
        )
        if not programs:
            return WalletJoinResult(memberships=[], created_count=0)
        existing_program_ids = set(
            LoyaltyMembership.objects.filter(
                customer=customer, program__in=programs
            ).values_list("program_id", flat=True)
        )
        new_memberships = [
            LoyaltyMembership(program=program, customer=customer)
            for program in programs
            if program.id not in existing_program_ids
        ]
        LoyaltyMembership.objects.bulk_create(
            new_memberships,
            ignore_conflicts=True,
        )
        memberships = list(
            LoyaltyMembership.objects.filter(
                customer=customer, program__in=programs
            ).order_by("program__created_at", "program_id")
        )
        return WalletJoinResult(
            memberships=memberships,
            created_count=len(memberships) - len(existing_program_ids),
        )

    @staticmethod
    def card_view(
        program: LoyaltyProgram,
        customer: User,
        membership: LoyaltyMembership | None = None,
    ) -> LoyaltyCardView:
        """Project program config plus optional customer state without creating a card.

        When the program carries a cashback status ladder, ``pct_back`` is the
        customer's current rung rate (their real effective cashback), the full
        ladder is included for display, and next-rung progress is computed from
        the membership's lifetime visit count.
        """
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
        tiers = [
            LoyaltyTierView(
                name=tier.name,
                min_visits=tier.min_visits,
                cashback_percent=tier.cashback_percent,
            )
            for tier in program.tiers.all()
        ]
        standing = LoyaltyTierService.standing(
            program, membership.visits_count if membership else 0
        )
        if standing.current is not None:
            pct_back = standing.current.cashback_percent
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
            last_activity_at=membership.last_activity_at if membership else None,
            joined=membership is not None,
            stamps_count=membership.stamps_count if membership else 0,
            visits_count=membership.visits_count if membership else 0,
            required_count=program.required_count,
            points_balance=membership.points_balance if membership else 0,
            min_redeem_points=program.min_redeem_points,
            points_per_som=program.points_per_som,
            cashback_per_point=program.cashback_per_point,
            pct_back=pct_back,
            tiers=tiers,
            current_tier_name=standing.current.name if standing.current else None,
            next_tier_name=standing.next_tier.name if standing.next_tier else None,
            next_tier_visits_left=standing.visits_to_next,
            business_lat=program.business.latitude,
            business_lng=program.business.longitude,
        )

    @staticmethod
    def cards_for_customer(customer: User) -> list[LoyaltyCardView]:
        """Return all joined cards with program and business loaded in two queries."""
        memberships: QuerySet[LoyaltyMembership] = (
            LoyaltyMembership.objects.filter(customer=customer)
            .select_related("program__business")
            .prefetch_related("program__tiers")
            .order_by("-last_activity_at", "-joined_at", "id")
        )
        return [
            LoyaltyMembershipService.card_view(row.program, customer, row)
            for row in memberships
        ]

    @staticmethod
    def rows_for_business_customer(
        business: object, customer: User
    ) -> list[LoyaltyCardView]:
        """Return every active business program, including unjoined zero-state cards."""
        programs = (
            LoyaltyProgram.objects.filter(
                business=business, status=LoyaltyProgram.Status.ACTIVE
            )
            .select_related("business")
            .prefetch_related("tiers")
        )
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
