"""Staff-till activity service: today's stats + the unified activity feed.

Backs ``GET /api/staff/stats/`` and the reworked
``GET /api/staff/recent-activity/`` (staff-app-handoff plan §B1). Everything is
scoped to the staff member's business; views resolve the member and pass the
business in.

The feed merges three read-only sources into one ``events`` list, newest first:

* ``ScanLog`` SUCCESS rows whose action code maps to a kind (campaign visit /
  group / social confirmations),
* ``LoyaltyTransaction`` EARN rows (stamp / points / visit card advances),
* REDEEMED ``CampaignRewardVoucher`` + ``LoyaltyVoucher`` rows (redemptions).

The spec's ``join`` kind is intentionally not emitted: loyalty memberships are
``get_or_create``'d on first earn and campaign enrollment writes no scan log, so
there is no explicit enroll signal in the data to surface yet.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from django.utils import timezone

from apps.businesses.models import Business
from apps.campaigns.models import Campaign, CampaignRewardVoucher
from apps.loyalty.models import LoyaltyTransaction, LoyaltyVoucher
from apps.qr.models import ScanLog

# Feed kinds the till can render — the spec enum (§B1) minus "join" (no explicit
# enroll signal exists in the data yet; see module docstring).
ACTIVITY_KINDS: tuple[str, ...] = ("redeem", "stamp", "visit", "points", "social")

# ScanLog action code → activity kind. Only staff-attributed campaign confirm
# actions map to events. Bare token-resolve logs (staff_scan, campaign_scan_customer,
# unified_confirm_visit, ...) are plumbing noise, and campaign_redeem_voucher is
# deliberately absent — the REDEEMED voucher row already represents that
# redemption, and mapping both would double-count one event.
_SCAN_ACTION_KINDS: dict[str, str] = {
    "campaign_confirm_visit": "visit",
    # A confirmed group check-in is a visit confirmation for the till feed.
    "campaign_confirm_group": "visit",
    "campaign_confirm_social": "social",
}

# ponytail: per-source fetch cap for the merged feed. Four models cannot share
# one DB cursor, so the feed is merged and sorted in memory; 500 recent rows per
# source is far beyond what a till ever scrolls. Upgrade path: a DB-level UNION
# view if deep history paging ever matters.
_ACTIVITY_SOURCE_CAP = 500


@dataclass(frozen=True)
class StaffTodayStats:
    """Today's headline counters for the staff member's business.

    ``scans_today`` counts SUCCESS scan logs created today; ``redemptions_today``
    counts campaign + loyalty vouchers redeemed today. "Today" is the current
    local calendar date (``timezone.localdate``), not a rolling 24h window.
    """

    scans_today: int
    redemptions_today: int


@dataclass(frozen=True)
class ActivityEvent:
    """One row in the unified staff-till activity feed.

    ``kind`` is a member of :data:`ACTIVITY_KINDS`. ``customer`` is a masked
    display string (see :func:`_mask_customer`) — never a raw full name + phone.
    ``label`` is short data context (campaign / program / reward name), not
    translated copy; the frontend owns wording.
    """

    id: str
    kind: str
    customer: str
    label: str
    created_at: datetime


def _mask_customer(customer) -> str:
    """Mask a customer for staff display: first name + last-name initial.

    "Aida Nurlanovna" → "Aida N."; a single name passes through unchanged. A
    customer with no name falls back to their phone masked to the last two
    digits (the same disclosure rule as the campaigns unified-scan serializer),
    so the till can disambiguate without leaking full PII. ``None`` → "".
    """
    if customer is None:
        return ""
    parts = [p for p in (customer.name or "").split() if p]
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1][0]}."
    if parts:
        return parts[0]
    phone = customer.phone or ""
    if not phone:
        return ""
    return f"{'•' * max(len(phone) - 2, 0)}{phone[-2:]}"


def get_staff_today_stats(business: Business) -> StaffTodayStats:
    """Compute today's scan and redemption counts for ``business``.

    ``scans_today`` = SUCCESS ``ScanLog`` rows created today (any action — a
    successful scan is a successful scan) plus ``LoyaltyTransaction`` EARN rows
    today — loyalty awards write a transaction but no scan log, so counting only
    scan logs would show 0 after a till full of stamp awards (the sources are
    disjoint: campaign confirms log scans, loyalty awards log transactions).
    ``redemptions_today`` = campaign plus loyalty vouchers with status REDEEMED
    and ``redeemed_at`` today. "Today" is ``timezone.localdate()``; the
    ``__date`` lookup converts in the active timezone, so the boundary is the
    local midnight, not UTC's.
    """
    today = timezone.localdate()
    scans = ScanLog.objects.filter(
        business=business, status=ScanLog.Status.SUCCESS, created_at__date=today
    ).count() + LoyaltyTransaction.objects.filter(
        business=business,
        kind=LoyaltyTransaction.Kind.EARN,
        created_at__date=today,
    ).count()
    redemptions = CampaignRewardVoucher.objects.filter(
        business=business,
        status=CampaignRewardVoucher.Status.REDEEMED,
        redeemed_at__date=today,
    ).count() + LoyaltyVoucher.objects.filter(
        business=business,
        status=LoyaltyVoucher.Status.REDEEMED,
        redeemed_at__date=today,
    ).count()
    return StaffTodayStats(scans_today=scans, redemptions_today=redemptions)


def _scan_events(business: Business, kind: str | None) -> list[ActivityEvent]:
    """Events from SUCCESS scan logs whose action maps to a kind.

    Labels resolve the ``campaign_id`` the scanner stored in ``metadata`` to the
    campaign name in one bulk query (empty when no row carries one).
    """
    actions = [a for a, k in _SCAN_ACTION_KINDS.items() if kind is None or k == kind]
    if not actions:
        return []
    scans = list(
        ScanLog.objects.filter(
            business=business, status=ScanLog.Status.SUCCESS, action__in=actions
        )
        .select_related("customer")
        .order_by("-created_at")[:_ACTIVITY_SOURCE_CAP]
    )
    campaign_ids = {
        s.metadata.get("campaign_id") for s in scans if s.metadata.get("campaign_id")
    }
    names = {
        str(c.id): c.name
        for c in Campaign.objects.filter(id__in=campaign_ids).only("id", "name")
    }
    return [
        ActivityEvent(
            id=str(s.id),
            kind=_SCAN_ACTION_KINDS[s.action],
            customer=_mask_customer(s.customer),
            label=names.get(str(s.metadata.get("campaign_id") or ""), ""),
            created_at=s.created_at,
        )
        for s in scans
    ]


def _earn_kind(txn: LoyaltyTransaction) -> str:
    """Map an EARN transaction to stamp / points / visit by its deltas.

    A stamp delta wins over a points delta (a single earn never legitimately
    carries both); no delta at all means a visit-card advance.
    """
    if txn.stamps_delta is not None:
        return "stamp"
    if txn.points_delta is not None:
        return "points"
    return "visit"


def _loyalty_earn_events(business: Business, kind: str | None) -> list[ActivityEvent]:
    """Events from loyalty EARN transactions, labelled with the program name.

    When a specific kind is requested the queryset pre-filters on the delta
    columns (mirroring :func:`_earn_kind` precedence) so the fetch cap is spent
    only on matching rows.
    """
    if kind is not None and kind not in ("stamp", "points", "visit"):
        return []
    qs = LoyaltyTransaction.objects.filter(
        business=business, kind=LoyaltyTransaction.Kind.EARN
    ).select_related("customer", "program")
    if kind == "stamp":
        qs = qs.filter(stamps_delta__isnull=False)
    elif kind == "points":
        qs = qs.filter(points_delta__isnull=False, stamps_delta__isnull=True)
    elif kind == "visit":
        qs = qs.filter(points_delta__isnull=True, stamps_delta__isnull=True)
    return [
        ActivityEvent(
            id=str(t.id),
            kind=_earn_kind(t),
            customer=_mask_customer(t.customer),
            label=t.program.name,
            created_at=t.created_at,
        )
        for t in qs.order_by("-created_at")[:_ACTIVITY_SOURCE_CAP]
    ]


def _redeem_events(business: Business, kind: str | None) -> list[ActivityEvent]:
    """Redeem events from REDEEMED campaign + loyalty vouchers.

    ``created_at`` is the redemption moment (``redeemed_at``); rows without one
    are excluded as defensive hygiene — every redeem flow sets it. Labels are the
    reward title, falling back to the voucher code.
    """
    if kind is not None and kind != "redeem":
        return []
    events: list[ActivityEvent] = []
    campaign_vouchers = (
        CampaignRewardVoucher.objects.filter(
            business=business,
            status=CampaignRewardVoucher.Status.REDEEMED,
            redeemed_at__isnull=False,
        )
        .select_related("customer", "reward")
        .order_by("-redeemed_at")[:_ACTIVITY_SOURCE_CAP]
    )
    for voucher in campaign_vouchers:
        if voucher.redeemed_at is None:  # filtered above; narrows for typing
            continue
        events.append(
            ActivityEvent(
                id=str(voucher.id),
                kind="redeem",
                customer=_mask_customer(voucher.customer),
                label=voucher.reward.title or voucher.voucher_code,
                created_at=voucher.redeemed_at,
            )
        )
    loyalty_vouchers = (
        LoyaltyVoucher.objects.filter(
            business=business,
            status=LoyaltyVoucher.Status.REDEEMED,
            redeemed_at__isnull=False,
        )
        .select_related("customer")
        .order_by("-redeemed_at")[:_ACTIVITY_SOURCE_CAP]
    )
    for loyalty_voucher in loyalty_vouchers:
        if loyalty_voucher.redeemed_at is None:  # filtered above; narrows for typing
            continue
        events.append(
            ActivityEvent(
                id=str(loyalty_voucher.id),
                kind="redeem",
                customer=_mask_customer(loyalty_voucher.customer),
                label=loyalty_voucher.reward_title or loyalty_voucher.voucher_code,
                created_at=loyalty_voucher.redeemed_at,
            )
        )
    return events


def list_activity_events(
    business: Business, kind: str | None = None
) -> list[ActivityEvent]:
    """Return the merged activity feed for ``business``, newest first.

    Merges scan-log confirmations, loyalty earns, and voucher redemptions (see
    module docstring for the source → kind mapping). ``kind`` must be ``None``
    or a member of :data:`ACTIVITY_KINDS` (the serializer validates membership);
    when given, only the sources that can produce it are queried. The query
    count is flat regardless of row count — each source is one capped query —
    and is asserted in the test suite (``django_assert_num_queries``).
    """
    events = (
        _scan_events(business, kind)
        + _loyalty_earn_events(business, kind)
        + _redeem_events(business, kind)
    )
    events.sort(key=lambda e: e.created_at, reverse=True)
    return events
