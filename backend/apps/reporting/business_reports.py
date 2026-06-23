"""Business Reports service — builds the owner-facing analytics report.

All metrics derive from existing models (no new tables): ``ScanLog`` for visits/
scan timing/staff attribution, ``RewardRedemption`` for redemption rates,
``RewardTransaction.amount_spend`` for spend KPIs, ``CustomerRewardProgress`` for
enrollment/close-to-reward. The public surface is :func:`resolve_period` (period →
window) and :func:`build_business_report` (window → typed :class:`BusinessReport`).

Definitions enforced here (kept stable so the prose and code never drift):
- A **visit** is a distinct ``(customer, calendar-day)`` pair — multiple same-day
  scans count once, so a "visit" maps to a real footfall.
- A **success scan** is ``ScanLog.status == success``; failed/blocked scans never
  enter any metric.
- **Deltas** compare the metric against the immediately preceding window of equal
  length; ``None`` when there is no baseline to divide by.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, Max, Min, QuerySet, Sum
from django.db.models.functions import ExtractHour, TruncDate, TruncMonth
from django.utils import timezone

from apps.businesses.models import Business
from apps.loyalty.models import CustomerRewardProgress, RewardRedemption, RewardTransaction
from apps.qr.models import ScanLog
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException

# --- tuning constants (values + provenance) ---
# Storefront trading window the design renders as 7a–7p in 2-hour bars.
BUSIEST_OPEN_HOUR = 7
BUSIEST_CLOSE_HOUR = 19
BUSIEST_BUCKET_HOURS = 2
# Retention "new vs returning" trend length shown in the design.
TREND_MONTHS = 6
# A customer is "close to a reward" once ≥80% of the way to the target — the
# product threshold for an "almost there" nudge.
CLOSE_TO_REWARD_RATIO = Decimal("0.8")
# Lapsed-customer (churn-risk) window: no visit in 30 days.
AT_RISK_DAYS = 30
# Cohort thresholds (distinct visit-days), from the design's Customer mix bands.
RETURNING_MIN_VISITS = 2
LOYAL_MIN_VISITS = 5

_WEEK_DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]
_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_PERIOD_LABELS = {"today": "Today", "week": "This week", "month": "This month"}


# --------------------------------------------------------------------------- #
# Typed report surface
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Kpi:
    key: str
    value: str  # display-ready ("38%", "1,420 som", "—")
    delta_pct: int | None
    hint: str


@dataclass(frozen=True)
class SeriesPoint:
    label: str
    value: int


@dataclass(frozen=True)
class StackedPoint:
    label: str
    new: int
    returning: int


@dataclass(frozen=True)
class Cohort:
    label: str
    count: int
    pct: int


@dataclass(frozen=True)
class StaffRow:
    id: str
    name: str
    role: str
    scans: int
    signups: int
    redemptions: int
    conversion_pct: int
    trend_pct: int | None
    top: bool


@dataclass(frozen=True)
class TeamTotals:
    scans: int
    redemptions: int
    signups: int
    active_days: int  # replaces the design's untracked "hours on shift"


@dataclass(frozen=True)
class Insight:
    icon: str
    text: str


@dataclass(frozen=True)
class BusinessReport:
    period: str
    range_label: str
    kpis: list[Kpi]
    scans_over_time: list[SeriesPoint]
    busiest_hours: list[SeriesPoint]
    new_vs_returning: list[StackedPoint]
    cohorts: list[Cohort]
    staff: list[StaffRow]
    team_totals: TeamTotals
    insights: list[Insight]


@dataclass(frozen=True)
class ReportWindow:
    period: str
    start: datetime
    end: datetime
    prev_start: datetime
    prev_end: datetime
    label: str
    bucket: str  # "hour" | "day7" | "day"


# --------------------------------------------------------------------------- #
# Period resolution
# --------------------------------------------------------------------------- #
def _month_start(dt: datetime) -> datetime:
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _shift_month_start(ms: datetime, *, back: int) -> datetime:
    """Return the first-of-month ``back`` months before ``ms`` (an aware month start)."""
    year, month = ms.year, ms.month - back
    while month <= 0:
        month += 12
        year -= 1
    return ms.replace(year=year, month=month)


def resolve_period(period: str, date_from: date | None, date_to: date | None) -> ReportWindow:
    """Translate a period selector into a :class:`ReportWindow`.

    ``period`` is one of ``today | week | month | custom``. ``custom`` requires
    ``date_from`` and ``date_to`` with ``date_from <= date_to`` — otherwise a
    ``VALIDATION_ERROR`` is raised (a business rule the serializer cannot check).
    The previous window is always the equal-length span ending at ``start``.
    """
    now = timezone.localtime()
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
        return ReportWindow("today", start, end, start - timedelta(days=1), start, _PERIOD_LABELS["today"], "hour")
    if period == "week":
        midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start = midnight - timedelta(days=midnight.weekday())  # Monday
        end = now
        return ReportWindow("week", start, end, start - timedelta(days=7), start, _PERIOD_LABELS["week"], "day7")
    if period == "custom":
        if date_from is None or date_to is None or date_from > date_to:
            raise JaqynAPIException("VALIDATION_ERROR", "A valid from/to date range is required", status_code=400)
        tz = timezone.get_current_timezone()
        start = timezone.make_aware(datetime.combine(date_from, time.min), tz)
        end = timezone.make_aware(datetime.combine(date_to + timedelta(days=1), time.min), tz)
        span = end - start
        label = f"{date_from.strftime('%-d %b')} – {date_to.strftime('%-d %b')}"
        return ReportWindow("custom", start, end, start - span, start, label, "day")
    # default: month
    start = _month_start(now)
    end = now
    prev_start = _shift_month_start(start, back=1)
    return ReportWindow("month", start, end, prev_start, start, _PERIOD_LABELS["month"], "day")


# --------------------------------------------------------------------------- #
# Building blocks
# --------------------------------------------------------------------------- #
def _success_scans(business: Business, start: datetime, end: datetime) -> QuerySet[ScanLog]:
    """Success scans for ``business`` in ``[start, end)`` (failed/blocked excluded)."""
    return ScanLog.objects.filter(
        business=business,
        status=ScanLog.Status.SUCCESS,
        created_at__gte=start,
        created_at__lt=end,
    )


def _customer_visit_days(scans: QuerySet[ScanLog]) -> list[dict[str, object]]:
    """Distinct visit-days per customer: rows of ``{customer, days}`` (one query)."""
    return list(
        scans.exclude(customer__isnull=True)
        .annotate(day=TruncDate("created_at"))
        .values("customer")
        .annotate(days=Count("day", distinct=True))
    )


@dataclass(frozen=True)
class _RawMetrics:
    repeat_rate: float | None
    visit_freq: float | None
    redemption_rate: float | None
    customer_value: Decimal | None
    spend_per_visit: Decimal | None
    enrollment_rate: float | None


def _raw_metrics(business: Business, start: datetime, end: datetime) -> _RawMetrics:
    """Compute the six headline KPIs for a single window (no formatting, no deltas)."""
    scans = _success_scans(business, start, end)
    visit_rows = _customer_visit_days(scans)
    customers = len(visit_rows)
    visits = sum(int(r["days"]) for r in visit_rows)
    repeat = sum(1 for r in visit_rows if int(r["days"]) >= RETURNING_MIN_VISITS)

    redemptions = RewardRedemption.objects.filter(business=business, created_at__gte=start, created_at__lt=end)
    redemptions_total = redemptions.count()
    redemptions_claimed = redemptions.filter(status=RewardRedemption.Status.REDEEMED).count()

    spend = RewardTransaction.objects.filter(
        business=business,
        action=RewardTransaction.Action.EARNED,
        amount_spend__isnull=False,
        created_at__gte=start,
        created_at__lt=end,
    ).aggregate(total=Sum("amount_spend"))["total"]

    enrolled = (
        CustomerRewardProgress.objects.filter(business=business, created_at__gte=start, created_at__lt=end)
        .values("customer")
        .distinct()
        .count()
    )

    return _RawMetrics(
        repeat_rate=(repeat / customers * 100) if customers else None,
        visit_freq=(visits / customers) if customers else None,
        redemption_rate=(redemptions_claimed / redemptions_total * 100) if redemptions_total else None,
        customer_value=(spend / customers) if (spend is not None and customers) else None,
        spend_per_visit=(spend / visits) if (spend is not None and visits) else None,
        enrollment_rate=min(enrolled / customers * 100, 100) if customers else None,
    )


def _delta(current: float | Decimal | None, previous: float | Decimal | None) -> int | None:
    """Percentage change of ``current`` vs ``previous``; ``None`` without a baseline."""
    if current is None or previous is None or previous == 0:
        return None
    return round((float(current) - float(previous)) / float(previous) * 100)


def _money(value: Decimal | None) -> str:
    """Format a som amount with thousands separators, or ``—`` when unavailable."""
    if value is None:
        return "—"
    return f"{round(value):,} som"


def _build_kpis(business: Business, window: ReportWindow) -> list[Kpi]:
    cur = _raw_metrics(business, window.start, window.end)
    prev = _raw_metrics(business, window.prev_start, window.prev_end)

    def pct(value: float | None) -> str:
        return f"{round(value)}%" if value is not None else "—"

    return [
        Kpi("repeat_purchase_rate", pct(cur.repeat_rate), _delta(cur.repeat_rate, prev.repeat_rate), "Customers with 2+ visits"),
        Kpi(
            "avg_visit_frequency",
            f"{cur.visit_freq:.1f}×" if cur.visit_freq is not None else "—",
            _delta(cur.visit_freq, prev.visit_freq),
            "Visits per customer",
        ),
        Kpi("reward_redemption_rate", pct(cur.redemption_rate), _delta(cur.redemption_rate, prev.redemption_rate), "Earned rewards actually claimed"),
        Kpi("est_customer_value", _money(cur.customer_value), _delta(cur.customer_value, prev.customer_value), "Spend per member"),
        Kpi("avg_spend_per_visit", _money(cur.spend_per_visit), _delta(cur.spend_per_visit, prev.spend_per_visit), "Across all loyalty scans"),
        Kpi("enrollment_rate", pct(cur.enrollment_rate), _delta(cur.enrollment_rate, prev.enrollment_rate), "Walk-ins joining the program"),
    ]


def _scans_over_time(business: Business, window: ReportWindow) -> list[SeriesPoint]:
    """Bucket success scans across the window: hourly (today), per-weekday (week),
    or per-day (month/custom). Empty buckets are kept so the chart spans the window."""
    scans = _success_scans(business, window.start, window.end)
    if window.bucket == "day7":
        counts = {
            row["day"]: row["c"]
            for row in scans.annotate(day=TruncDate("created_at")).values("day").annotate(c=Count("id"))
        }
        out: list[SeriesPoint] = []
        for i in range(7):
            d = (window.start + timedelta(days=i)).date()
            out.append(SeriesPoint(_WEEK_DAY_LABELS[i], counts.get(d, 0)))
        return out
    if window.bucket == "hour":
        counts = {row["h"]: row["c"] for row in scans.annotate(h=ExtractHour("created_at")).values("h").annotate(c=Count("id"))}
        return [SeriesPoint(_hour_label(h), counts.get(h, 0)) for h in range(BUSIEST_OPEN_HOUR, BUSIEST_CLOSE_HOUR + 1)]
    # per-day
    counts = {
        row["day"]: row["c"]
        for row in scans.annotate(day=TruncDate("created_at")).values("day").annotate(c=Count("id"))
    }
    out = []
    day = window.start.date()
    last = (window.end - timedelta(microseconds=1)).date()
    while day <= last:
        out.append(SeriesPoint(str(day.day), counts.get(day, 0)))
        day += timedelta(days=1)
    return out


def _hour_label(hour: int) -> str:
    suffix = "a" if hour < 12 else "p"
    h12 = hour % 12 or 12
    return f"{h12}{suffix}"


def _busiest_hours(business: Business, window: ReportWindow) -> list[SeriesPoint]:
    """2-hour scan buckets across the trading window (7a–7p), summed over the period."""
    scans = _success_scans(business, window.start, window.end)
    per_hour = {row["h"]: row["c"] for row in scans.annotate(h=ExtractHour("created_at")).values("h").annotate(c=Count("id"))}
    out: list[SeriesPoint] = []
    for start_hour in range(BUSIEST_OPEN_HOUR, BUSIEST_CLOSE_HOUR + 1, BUSIEST_BUCKET_HOURS):
        total = sum(per_hour.get(h, 0) for h in range(start_hour, start_hour + BUSIEST_BUCKET_HOURS))
        out.append(SeriesPoint(_hour_label(start_hour), total))
    return out


def _new_vs_returning(business: Business) -> list[StackedPoint]:
    """Monthly new vs returning customers over the last ``TREND_MONTHS`` months.

    "New" = customers whose first-ever success scan falls in that month; "returning"
    = customers active that month whose first scan predates it.
    """
    base = ScanLog.objects.filter(business=business, status=ScanLog.Status.SUCCESS).exclude(customer__isnull=True)
    first_by_customer = {row["customer"]: row["first"] for row in base.values("customer").annotate(first=Min("created_at"))}
    active = base.annotate(month=TruncMonth("created_at")).values("customer", "month").distinct()
    active_by_month: dict[date, set[object]] = {}
    for row in active:
        active_by_month.setdefault(row["month"].date(), set()).add(row["customer"])
    first_month_by_customer = {c: dt.date().replace(day=1) for c, dt in first_by_customer.items()}

    now = timezone.localtime()
    months = [_shift_month_start(_month_start(now), back=i) for i in range(TREND_MONTHS - 1, -1, -1)]
    out: list[StackedPoint] = []
    for m in months:
        key = m.date()
        members = active_by_month.get(key, set())
        new = sum(1 for c in members if first_month_by_customer.get(c) == key)
        out.append(StackedPoint(_MONTH_LABELS[m.month - 1], new, len(members) - new))
    return out


def _cohorts(business: Business, window: ReportWindow) -> list[Cohort]:
    """New / Returning / Loyal customer mix by distinct visit-days within the window."""
    rows = _customer_visit_days(_success_scans(business, window.start, window.end))
    new = sum(1 for r in rows if int(r["days"]) < RETURNING_MIN_VISITS)
    returning = sum(1 for r in rows if RETURNING_MIN_VISITS <= int(r["days"]) < LOYAL_MIN_VISITS)
    loyal = sum(1 for r in rows if int(r["days"]) >= LOYAL_MIN_VISITS)
    total = new + returning + loyal

    def pct(n: int) -> int:
        return round(n / total * 100) if total else 0

    return [
        Cohort("New (0–1 visits)", new, pct(new)),
        Cohort("Returning (2–4)", returning, pct(returning)),
        Cohort("Loyal (5+)", loyal, pct(loyal)),
    ]


def _staff_performance(business: Business, window: ReportWindow) -> tuple[list[StaffRow], TeamTotals]:
    """Per-staff scans/sign-ups/redemptions/trend plus team totals for the window.

    A **sign-up** is attributed to the staff member who handled a customer's
    first-ever success scan, counted when that first scan lands in the window.
    """
    scans = _success_scans(business, window.start, window.end).filter(staff__isnull=False)
    scans_by_staff = {row["staff"]: row["c"] for row in scans.values("staff").annotate(c=Count("id"))}
    prev_scans = _success_scans(business, window.prev_start, window.prev_end).filter(staff__isnull=False)
    prev_by_staff = {row["staff"]: row["c"] for row in prev_scans.values("staff").annotate(c=Count("id"))}

    redemptions = RewardRedemption.objects.filter(
        business=business,
        status=RewardRedemption.Status.REDEEMED,
        redeemed_by__isnull=False,
        created_at__gte=window.start,
        created_at__lt=window.end,
    )
    redemptions_by_staff = {row["redeemed_by"]: row["c"] for row in redemptions.values("redeemed_by").annotate(c=Count("id"))}

    # First-ever scan per customer (across all time) → attribute the sign-up.
    signups_by_staff: dict[object, int] = {}
    seen: set[object] = set()
    first_scans = (
        ScanLog.objects.filter(business=business, status=ScanLog.Status.SUCCESS)
        .exclude(customer__isnull=True)
        .order_by("customer", "created_at")
        .values("customer", "staff", "created_at")
    )
    for row in first_scans:
        cid = row["customer"]
        if cid in seen:
            continue
        seen.add(cid)
        if row["staff"] is not None and window.start <= row["created_at"] < window.end:
            signups_by_staff[row["staff"]] = signups_by_staff.get(row["staff"], 0) + 1

    members = StaffMember.objects.filter(business=business).order_by("name")
    rows: list[StaffRow] = []
    for m in members:
        scan_count = scans_by_staff.get(m.id, 0)
        if scan_count == 0 and m.id not in redemptions_by_staff and m.id not in signups_by_staff:
            continue
        signups = signups_by_staff.get(m.id, 0)
        rows.append(
            StaffRow(
                id=str(m.id),
                name=m.name,
                role=m.get_role_display(),
                scans=scan_count,
                signups=signups,
                redemptions=redemptions_by_staff.get(m.id, 0),
                conversion_pct=round(signups / scan_count * 100) if scan_count else 0,
                trend_pct=_delta(scan_count, prev_by_staff.get(m.id)),
                top=False,
            )
        )
    rows.sort(key=lambda r: r.scans, reverse=True)
    if rows:
        top = rows[0]
        rows[0] = StaffRow(**{**top.__dict__, "top": True})

    active_days = (
        scans.annotate(day=TruncDate("created_at")).values("day").distinct().count()
    )
    totals = TeamTotals(
        scans=sum(r.scans for r in rows),
        redemptions=sum(r.redemptions for r in rows),
        signups=sum(r.signups for r in rows),
        active_days=active_days,
    )
    return rows, totals


def _insights(business: Business, busiest: list[SeriesPoint]) -> list[Insight]:
    """Derive plain-text callouts; only include the ones backed by real data."""
    out: list[Insight] = []

    close = 0
    for p in CustomerRewardProgress.objects.filter(
        business=business, status=CustomerRewardProgress.Status.ACTIVE, target_count__gt=0
    ).values("current_count", "target_count"):
        target = p["target_count"]
        if target and p["current_count"] < target and p["current_count"] >= float(CLOSE_TO_REWARD_RATIO) * target:
            close += 1
    if close:
        out.append(Insight("💡", f"{close} customers are close to a reward. Encourage one more visit — they convert faster than new visitors."))

    if busiest:
        peak = max(busiest, key=lambda b: b.value)
        if peak.value:
            out.append(Insight("⏰", f"{peak.label} is your busiest hour. Staffing your strongest team here lifts scan-to-enroll conversion."))

    cutoff = timezone.localtime() - timedelta(days=AT_RISK_DAYS)
    at_risk = 0
    for row in (
        ScanLog.objects.filter(business=business, status=ScanLog.Status.SUCCESS)
        .exclude(customer__isnull=True)
        .annotate(day=TruncDate("created_at"))
        .values("customer")
        .annotate(days=Count("day", distinct=True), last=Max("created_at"))
    ):
        if int(row["days"]) >= LOYAL_MIN_VISITS and row["last"] < cutoff:
            at_risk += 1
    if at_risk:
        out.append(Insight("⚠️", f"{at_risk} loyal customers have not returned in {AT_RISK_DAYS} days. A reminder can win most of them back."))

    return out


def build_business_report(business: Business, window: ReportWindow) -> BusinessReport:
    """Assemble the full :class:`BusinessReport` for ``business`` over ``window``."""
    busiest = _busiest_hours(business, window)
    staff, totals = _staff_performance(business, window)
    return BusinessReport(
        period=window.period,
        range_label=window.label,
        kpis=_build_kpis(business, window),
        scans_over_time=_scans_over_time(business, window),
        busiest_hours=busiest,
        new_vs_returning=_new_vs_returning(business),
        cohorts=_cohorts(business, window),
        staff=staff,
        team_totals=totals,
        insights=_insights(business, busiest),
    )
