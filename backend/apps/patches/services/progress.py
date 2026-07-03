"""PatchProgressService — rule engine for patch achievements (spec §A).

Called via the evaluate_patches Celery task (apps/patches/tasks.py) which is
enqueued via transaction.on_commit from existing services. Each call is
idempotent: earned_at is set exactly once under a select_for_update lock.

Rule types implemented:
  FIRST_EVENT(event)         — earned if the user has ≥1 event of that type.
  DISTINCT_BUSINESSES(n, category?) — count businesses with stamps/visits/actions.
  CARDS_COMPLETED(n, category?) — count loyalty completions + campaign completions.
  TIME_OF_DAY(direction, time) — earned if user ever had a stamp before/after HH:MM
                                  in Bishkek local time (UTC+6, no DST).
  GROUP_LED(n)               — count successfully completed group sessions led.
  WEEKEND_STREAK(n)          — consecutive ISO-weeks ending now with ≥1 weekend visit.
  SPEND_TOTAL(som)           — total bill_amount from EARN transactions.
  REFERRALS(n)               — no-op v1: no referral data source yet.
  DISTRICTS(n)               — no-op v1: no district-geo boundary data yet.

Timezone for TIME_OF_DAY: Bishkek is UTC+6 with no daylight saving time (stable
offset). Using a fixed offset instead of pytz/zoneinfo avoids a tz-database
dependency mismatch on Railway. Source: design spec; Kyrgyzstan time zone rule.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.patches.models import PatchDef, UserPatch

logger = logging.getLogger(__name__)

# Bishkek is UTC+6, no DST. Used for TIME_OF_DAY comparisons.
# Source: Kyrgyzstan standard time (KRGT); stable since 2005.
_BISHKEK_TZ = dt_timezone(timedelta(hours=6))

# Suffix for weekend days in Python's weekday() method: 5 = Saturday, 6 = Sunday.
# Source: Python datetime.weekday() docs; Monday=0, Sunday=6.
_WEEKEND_DAYS = frozenset({5, 6})


def _compute_progress(
    user_id: int | str,
    patch: PatchDef,
    event: str,
    meta: dict[str, Any],
) -> tuple[int, int]:
    """Return (current, target) for this patch rule given the user's ledger data.

    All counts are derived from existing ledgers (read-only cross-service queries
    are explicitly authorised by the spec — no write coupling added). The event
    and meta are used only for FIRST_EVENT and TIME_OF_DAY where the trigger
    context is the evaluation signal.
    """
    params = patch.rule_params
    rule = patch.rule_type

    if rule == PatchDef.RuleType.FIRST_EVENT:
        return _eval_first_event(user_id, params, event)

    if rule == PatchDef.RuleType.DISTINCT_BUSINESSES:
        return _eval_distinct_businesses(user_id, params)

    if rule == PatchDef.RuleType.CARDS_COMPLETED:
        return _eval_cards_completed(user_id, params)

    if rule == PatchDef.RuleType.TIME_OF_DAY:
        return _eval_time_of_day(user_id, params)

    if rule == PatchDef.RuleType.GROUP_LED:
        return _eval_group_led(user_id, params)

    if rule == PatchDef.RuleType.WEEKEND_STREAK:
        return _eval_weekend_streak(user_id, params)

    if rule == PatchDef.RuleType.SPEND_TOTAL:
        return _eval_spend_total(user_id, params)

    if rule in (PatchDef.RuleType.REFERRALS, PatchDef.RuleType.DISTRICTS):
        # No-op evaluators in v1: no referral tracking or district geo-boundary
        # data exists yet. Progress stays at 0 so the patch shows as locked.
        # These defs are seeded so the board is populated; they will become live
        # when the corresponding data source ships.
        # Source: spec §A out-of-scope note ("DISTRICTS + REFERRALS may
        # legitimately never progress in v1").
        target = int(params.get("n", 1))
        return 0, target

    logger.warning("patches: unknown rule_type %r for patch %r", rule, patch.slug)
    return 0, 1


# ---------------------------------------------------------------------------
# Individual rule evaluators
# ---------------------------------------------------------------------------


def _eval_first_event(
    user_id: int | str, params: dict[str, Any], event: str
) -> tuple[int, int]:
    """FIRST_EVENT: earned after receiving any event matching params["event"].

    For stamp_scanned: queries LoyaltyTransaction for ≥1 EARN with stamps_delta>0.
    For other events: checks for ≥1 transaction (fallback to the triggering event).
    Target is always 1 — binary unlock.
    """
    from apps.loyalty.models import LoyaltyTransaction

    expected_event = params.get("event", "stamp_scanned")
    if expected_event == "stamp_scanned":
        has_any = LoyaltyTransaction.objects.filter(
            customer_id=user_id,
            kind=LoyaltyTransaction.Kind.EARN,
            stamps_delta__gt=0,
        ).exists()
    else:
        # Generic: any EARN transaction counts as "first event".
        has_any = LoyaltyTransaction.objects.filter(
            customer_id=user_id,
            kind=LoyaltyTransaction.Kind.EARN,
        ).exists()
    return (1 if has_any else 0), 1


def _eval_distinct_businesses(
    user_id: int | str, params: dict[str, Any]
) -> tuple[int, int]:
    """DISTINCT_BUSINESSES(n, category?): count businesses where user has an EARN transaction.

    Optionally filtered by Business.category. Counts across both loyalty and campaign
    ledgers using LoyaltyTransaction (which records business_id per earn).
    """
    from apps.loyalty.models import LoyaltyTransaction

    n = int(params.get("n", 1))
    category = params.get("category")
    qs = LoyaltyTransaction.objects.filter(
        customer_id=user_id,
        kind=LoyaltyTransaction.Kind.EARN,
    )
    if category:
        qs = qs.filter(business__category=category)
    count = qs.values("business_id").distinct().count()
    return min(count, n), n


def _eval_cards_completed(
    user_id: int | str, params: dict[str, Any]
) -> tuple[int, int]:
    """CARDS_COMPLETED(n, category?): count loyalty cards that produced a reward.

    A 'card completed' is a LoyaltyVoucher (loyalty) or CampaignRewardVoucher
    (campaign) that is not CANCELLED. Optionally filtered by business.category.
    """
    from apps.campaigns.models import CampaignRewardVoucher
    from apps.loyalty.models import LoyaltyVoucher

    n = int(params.get("n", 1))
    category = params.get("category")

    lv_qs = LoyaltyVoucher.objects.filter(customer_id=user_id).exclude(
        status=LoyaltyVoucher.Status.CANCELLED
    )
    cv_qs = CampaignRewardVoucher.objects.filter(customer_id=user_id).exclude(
        status=CampaignRewardVoucher.Status.CANCELLED
    )
    if category:
        lv_qs = lv_qs.filter(business__category=category)
        cv_qs = cv_qs.filter(business__category=category)

    count = lv_qs.count() + cv_qs.count()
    return min(count, n), n


def _eval_time_of_day(
    user_id: int | str, params: dict[str, Any]
) -> tuple[int, int]:
    """TIME_OF_DAY(direction, time): earned if user ever had a stamp at the right hour.

    ``direction`` is "before" or "after"; ``time`` is "HH:MM" in Bishkek local time
    (UTC+6). Queries LoyaltyTransaction for EARN with stamps_delta>0; converts
    each created_at to Bishkek local time and checks the hour:minute boundary.

    This is a binary unlock (target=1) — the customer earns it on first qualifying
    scan, not a count. Progress is 1 once earned, 0 until then.

    Timezone: Bishkek is UTC+6 stable. The comparison uses the transaction's
    created_at converted to UTC+6 because that is what the customer experiences.
    """
    from apps.loyalty.models import LoyaltyTransaction

    direction = params.get("direction", "before")
    time_str = params.get("time", "10:00")
    hour, minute = (int(x) for x in time_str.split(":"))

    stamp_times = (
        LoyaltyTransaction.objects.filter(
            customer_id=user_id,
            kind=LoyaltyTransaction.Kind.EARN,
            stamps_delta__gt=0,
        )
        .values_list("created_at", flat=True)
    )
    for utc_dt in stamp_times:
        local_dt = utc_dt.astimezone(_BISHKEK_TZ)
        local_minutes = local_dt.hour * 60 + local_dt.minute
        boundary_minutes = hour * 60 + minute
        if direction == "before" and local_minutes < boundary_minutes:
            return 1, 1
        if direction == "after" and local_minutes > boundary_minutes:
            return 1, 1

    return 0, 1


def _eval_group_led(
    user_id: int | str, params: dict[str, Any]
) -> tuple[int, int]:
    """GROUP_LED(n): count completed groups where user is the group_leader."""
    from apps.campaigns.models import Group

    n = int(params.get("n", 1))
    count = Group.objects.filter(
        group_leader_id=user_id,
        status=Group.Status.COMPLETED,
    ).count()
    return min(count, n), n


def _eval_weekend_streak(
    user_id: int | str, params: dict[str, Any]
) -> tuple[int, int]:
    """WEEKEND_STREAK(n): consecutive ISO-weeks ending now with ≥1 weekend visit.

    An ISO-week has a weekend visit if the user has a stamp/visit EARN transaction
    on Saturday (weekday==5) or Sunday (weekday==6) in Bishkek local time. Weeks
    are counted backward from the current week (inclusive), and the streak breaks
    at the first week with no weekend visit.

    Returns (consecutive_weeks, n) where consecutive_weeks is capped at n.
    """
    from apps.loyalty.models import LoyaltyTransaction

    n = int(params.get("n", 3))
    now_bishkek = timezone.now().astimezone(_BISHKEK_TZ)
    # ISO week number of the current week.
    current_iso_week = now_bishkek.isocalendar()[:2]  # (year, week)

    # Fetch all EARN transaction dates in Bishkek local time.
    earn_datetimes = list(
        LoyaltyTransaction.objects.filter(
            customer_id=user_id,
            kind=LoyaltyTransaction.Kind.EARN,
        )
        .values_list("created_at", flat=True)
        .order_by("created_at")
    )

    # Build a set of (iso_year, iso_week) tuples that had a weekend visit.
    weeks_with_weekend: set[tuple[int, int]] = set()
    for utc_dt in earn_datetimes:
        local_dt = utc_dt.astimezone(_BISHKEK_TZ)
        if local_dt.weekday() in _WEEKEND_DAYS:
            iso_cal = local_dt.isocalendar()
            weeks_with_weekend.add((iso_cal[0], iso_cal[1]))

    # Walk backward from current week counting consecutive weeks with a weekend visit.
    streak = 0
    check_year, check_week = current_iso_week
    for _ in range(n + 10):  # bound the walk
        if (check_year, check_week) in weeks_with_weekend:
            streak += 1
            if streak >= n:
                break
            # Move to the previous ISO week.
            # Subtract 7 days from Monday of the current ISO week.
            monday = datetime.fromisocalendar(check_year, check_week, 1)
            prev_monday = monday - timedelta(days=7)
            prev_iso = prev_monday.isocalendar()
            check_year, check_week = prev_iso[0], prev_iso[1]
        else:
            break

    return min(streak, n), n


def _eval_spend_total(
    user_id: int | str, params: dict[str, Any]
) -> tuple[int, int]:
    """SPEND_TOTAL(som): total bill_amount from EARN transactions across all businesses.

    Returns (int(total_spent), som) — progress_current is the integer som spent
    (truncated), progress_target is the threshold.
    """
    from apps.loyalty.models import LoyaltyTransaction

    target_som = int(params.get("som", 10000))
    result = LoyaltyTransaction.objects.filter(
        customer_id=user_id,
        kind=LoyaltyTransaction.Kind.EARN,
        bill_amount__isnull=False,
    ).aggregate(total=Sum("bill_amount"))
    total = int(result["total"] or 0)
    return min(total, target_som), target_som


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------


class PatchProgressService:
    """Evaluate patch rules for a user after a qualifying event (spec §A).

    Called by the evaluate_patches Celery task. Every call iterates all active
    PatchDef rows, recomputes progress from ledger data, and persists the result.
    The select_for_update on UserPatch prevents a concurrent call from double-
    setting earned_at. The whole mutation is wrapped in transaction.atomic.

    Notifications (patch_earned) are scheduled via the notifier outside the
    atomic block (on_commit callback) so the Celery-with-Postgres rule is honoured.
    """

    @classmethod
    def handle_event(
        cls, user_id: int | str, event: str, meta: dict[str, Any]
    ) -> list[str]:
        """Evaluate all active patches for user_id after event; return newly earned slugs.

        For each active PatchDef:
          1. Compute (current, target) from ledger data.
          2. Upsert a UserPatch row with the new progress.
          3. If current >= target and earned_at is not yet set, set earned_at now
             (under a row-level lock) and schedule a patch_earned notification
             via transaction.on_commit.

        Idempotent: re-running with the same state is a no-op (earned_at already
        set, progress_current already correct).
        """
        from apps.accounts.models import User

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            logger.warning("patches.handle_event: user %r not found", user_id)
            return []

        patches = list(PatchDef.objects.filter(is_active=True))
        newly_earned: list[str] = []

        for patch_def in patches:
            try:
                newly_earned_slug = cls._evaluate_one(user, patch_def, event, meta)
                if newly_earned_slug:
                    newly_earned.append(newly_earned_slug)
            except Exception:
                logger.exception(
                    "patches.handle_event: error evaluating %r for user %r",
                    patch_def.slug,
                    user_id,
                )

        return newly_earned

    @classmethod
    @transaction.atomic
    def _evaluate_one(
        cls,
        user: "Any",
        patch_def: PatchDef,
        event: str,
        meta: dict[str, Any],
    ) -> str | None:
        """Evaluate and persist progress for one patch; return slug if newly earned.

        Takes a select_for_update lock on the UserPatch row before checking
        earned_at so concurrent calls cannot both flip it.
        """
        current, target = _compute_progress(user.id, patch_def, event, meta)
        now = timezone.now()

        # Upsert the UserPatch row.
        row, created = UserPatch.objects.get_or_create(
            user=user,
            patch=patch_def,
            defaults={
                "progress_current": current,
                "progress_target": target,
            },
        )
        if not created:
            # Re-fetch under lock before mutating.
            row = UserPatch.objects.select_for_update().get(pk=row.pk)

        # Update progress regardless (the ledger may have grown since last eval).
        row.progress_current = current
        row.progress_target = target

        newly_earned = False
        if current >= target and row.earned_at is None:
            row.earned_at = now
            newly_earned = True

        row.save(update_fields=["progress_current", "progress_target", "earned_at", "updated_at"])

        if newly_earned:
            patch_slug = patch_def.slug
            user_id_str = str(user.id)

            def _notify(uid: str = user_id_str, slug: str = patch_slug) -> None:
                _schedule_patch_earned_notification(uid, slug)

            transaction.on_commit(_notify)
            return patch_slug

        return None


def _schedule_patch_earned_notification(user_id: str, patch_slug: str) -> None:
    """Enqueue the patch_earned notification (on_commit callback).

    Deferred to on_commit so the Celery worker never picks up an id before the
    outer transaction commits. Source: backend.md Celery rule.
    """
    from apps.patches.tasks import notify_patch_earned

    notify_patch_earned.delay(user_id, patch_slug)
