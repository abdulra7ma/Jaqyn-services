"""Free-trial lifecycle for businesses.

A business goes on trial when it is approved: ``start_trial`` stamps
``trial_started_at`` and computes ``trial_ends_at`` from
``SystemConfiguration.trial_period_days``. The end date is stored (not recomputed)
so reads never depend on the config and an admin can override it per business.

``trial_status`` derives display state from the business's own fields with no DB
queries, so it is safe to call once per row in an admin changelist.
"""

import math
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional

from django.db.models import QuerySet
from django.utils import timezone

from apps.businesses.models import Business

# Trials ending within this many days are surfaced as "expiring soon" on the
# dashboard. One week gives operators time to follow up before lapse.
TRIAL_EXPIRY_SOON_DAYS = 7


@dataclass(frozen=True)
class TrialStatus:
    """Computed trial state for one business. ``badge`` is "" when no trial applies."""

    active: bool
    expired: bool
    days_left: Optional[int]
    badge: str


def trial_status(business: Business) -> TrialStatus:
    """Derive a business's trial state from its own fields — no DB queries.

    A trial applies only when the business has a ``trial_ends_at`` and is neither
    a demo nor converted (``is_paid``). ``days_left`` is whole days remaining,
    rounded up so an end <24h away still reads as 1 day. Past the end date the
    status is expired with a "Trial ended" badge.
    """
    if business.is_demo or business.is_paid or business.trial_ends_at is None:
        return TrialStatus(active=False, expired=False, days_left=None, badge="")

    remaining = business.trial_ends_at - timezone.now()
    if remaining.total_seconds() <= 0:
        return TrialStatus(active=False, expired=True, days_left=0, badge="Trial ended")

    days_left = math.ceil(remaining.total_seconds() / 86400)  # 86400 = seconds per day
    return TrialStatus(active=True, expired=False, days_left=days_left, badge=f"Trial · {days_left}d left")


def start_trial(business: Business) -> None:
    """Stamp the trial window on a freshly-approved business.

    No-op when the business is a demo, already converted (``is_paid``), or already
    has a ``trial_started_at`` (idempotent across re-approval). Reads the trial
    length from ``SystemConfiguration`` and stores the resulting end date.
    """
    if business.is_demo or business.is_paid or business.trial_started_at is not None:
        return

    # Imported lazily to avoid a businesses→system import at module load.
    from apps.system.models import SystemConfiguration

    now = timezone.now()
    business.trial_started_at = now
    business.trial_ends_at = now + timedelta(days=SystemConfiguration.load().trial_period_days)
    business.save(update_fields=["trial_started_at", "trial_ends_at", "updated_at"])


def expiring_trials(within_days: int = TRIAL_EXPIRY_SOON_DAYS) -> QuerySet[Business]:
    """Active trials ending within ``within_days`` — excludes demo/paid businesses.

    Ordered soonest-first for the dashboard "trials expiring" queue.
    """
    now = timezone.now()
    return Business.objects.filter(
        is_demo=False,
        is_paid=False,
        trial_ends_at__gt=now,
        trial_ends_at__lte=now + timedelta(days=within_days),
    ).order_by("trial_ends_at")
