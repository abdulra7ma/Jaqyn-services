from __future__ import annotations

from dataclasses import dataclass

from apps.loyalty.models import LoyaltyProgram, LoyaltyTier


@dataclass(frozen=True)
class TierStanding:
    """A customer's position on a program's status ladder.

    ``current`` is the highest rung whose ``min_visits`` the customer has
    reached (always set when the ladder is non-empty, because a valid ladder
    starts at 0 visits). ``next_tier`` is the following rung, or None at the
    top; ``visits_to_next`` is the remaining visits to reach it.
    """

    current: LoyaltyTier | None
    next_tier: LoyaltyTier | None
    visits_to_next: int | None


class LoyaltyTierService:
    """Resolve a customer's status on a program's cashback ladder.

    Pure reads over an already-fetched tier list — callers pass
    ``program.tiers.all()`` (prefetched) so no query runs per resolution.
    """

    @staticmethod
    def standing(program: LoyaltyProgram, visits: int) -> TierStanding:
        """Return the current/next rung for ``visits`` lifetime visits.

        Rungs are evaluated in ascending ``min_visits`` order (model Meta
        ordering). The current rung is the last one with
        ``min_visits <= visits``; a ladder whose first rung starts above
        ``visits`` yields no current rung (only possible on legacy/invalid
        ladders — the write path enforces a rung at 0).
        """
        tiers = list(program.tiers.all())
        if not tiers:
            return TierStanding(current=None, next_tier=None, visits_to_next=None)
        current: LoyaltyTier | None = None
        next_tier: LoyaltyTier | None = None
        for tier in tiers:
            if tier.min_visits <= visits:
                current = tier
            else:
                next_tier = tier
                break
        visits_to_next = next_tier.min_visits - visits if next_tier else None
        return TierStanding(
            current=current, next_tier=next_tier, visits_to_next=visits_to_next
        )
