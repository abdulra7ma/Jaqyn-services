"""Admin dashboard data for the django-unfold index page.

``dashboard_callback`` is referenced by ``UNFOLD["DASHBOARD_CALLBACK"]`` and runs
on every render of the admin index. It injects the context consumed by the
``admin/index.html`` template override:

- ``kpi_cards`` — four gradient KPI tiles (label, value, sub, icon, gradient, url).
- ``mini_stats`` — small totals shown under the hero chart.
- ``signup_chart_data`` / ``signup_chart_options`` — JSON for the hero line chart
  (new customers + businesses per month), rendered by unfold's bundled Chart.js
  via a ``.chart`` canvas. Hero metric is *new signups* per product decision.
- ``status_chart_data`` / ``status_chart_options`` + ``status_legend`` — the
  businesses-by-status doughnut.
- ``review_queue`` — most recent businesses awaiting review.
- ``dashboard_recent`` — most recent admin audit-log entries.

``pending_businesses_badge`` is referenced by the sidebar nav item for Businesses
and renders a live count of businesses awaiting review.
"""

import calendar
import json
from datetime import timedelta
from typing import Any, Optional

from django.core.cache import cache
from django.db.models import Count
from django.db.models.functions import TruncMonth
from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import CustomerProfile, User
from apps.businesses.models import (
    Business,
    BusinessNote,
    BusinessOwnerInvite,
    StaffInvite,
)
from apps.campaigns.models import Campaign, CampaignRewardVoucher
from apps.groups.models import GroupOffer
from apps.loyalty.models import RewardProgram, RewardRedemption
from apps.qr.models import ScanLog
from apps.reporting.models import AdminAuditLog
from apps.staff.models import StaffMember

# Rolling window for "new" / "recent activity" KPI metrics. Seven days is the
# standard weekly operational cadence the dashboard reports against.
RECENT_WINDOW_DAYS = 7
# Number of months plotted on the hero signups chart.
SIGNUP_CHART_MONTHS = 6
# Rows shown in the recent-activity table and the pending review queue.
RECENT_ACTIVITY_LIMIT = 8
REVIEW_QUEUE_LIMIT = 8
ONBOARDING_QUEUE_LIMIT = 8

# Dashboard metrics + sidebar badge are cached this long (seconds). 60s keeps the
# admin index snappy under repeated loads while staying fresh enough for an
# operations view; a new business/scan appears within a minute.
DASHBOARD_CACHE_TTL = 60
DASHBOARD_CACHE_KEY = "admin:dashboard:metrics:v1"
BADGE_CACHE_KEY = "admin:dashboard:pending_badge:v1"

# Warm terracotta gradients for the KPI tiles (per design decision: stay in the
# Jaqyn brand family, not the multi-colour reference). Each is a CSS background.
_GRAD_CLAY = "linear-gradient(135deg, #D2805C, #C25E3C)"
_GRAD_AMBER = "linear-gradient(135deg, #E6B07E, #C9772F)"
_GRAD_ROSE = "linear-gradient(135deg, #C9657A, #9E3D52)"
_GRAD_ESPRESSO = "linear-gradient(135deg, #8A3C26, #5A2A1D)"

# Doughnut slice colours, ordered approved / pending / rejected / disabled.
_STATUS_COLORS = {
    Business.Status.APPROVED: "#C25E3C",
    Business.Status.PENDING: "#E0A27A",
    Business.Status.REJECTED: "#9E3D52",
    Business.Status.DISABLED: "#8A8A8A",
}


def _last_months(n: int) -> list[tuple[int, int]]:
    """Return the last ``n`` (year, month) tuples, oldest first, incl. this month."""
    now = timezone.now()
    year, month = now.year, now.month
    months: list[tuple[int, int]] = []
    for _ in range(n):
        months.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    months.reverse()
    return months


def _monthly_counts(model: Any) -> dict[tuple[int, int], int]:
    """Group a model's rows by created-at month → count, keyed by (year, month)."""
    rows = (
        model.objects.annotate(m=TruncMonth("created_at"))
        .values("m")
        .annotate(c=Count("id"))
    )
    return {(r["m"].year, r["m"].month): r["c"] for r in rows if r["m"] is not None}


def _nav_item(app_model: str, label: str, count: Optional[int] = None, add: bool = False) -> dict[str, Any]:
    """Build one curated nav-section row: changelist link, optional count + add link.

    ``app_model`` is the ``app_model`` portion of the admin URL name
    (e.g. ``businesses_business``).
    """
    item: dict[str, Any] = {"label": label, "url": reverse(f"admin:{app_model}_changelist")}
    if count is not None:
        item["count"] = count
    if add:
        item["add_url"] = reverse(f"admin:{app_model}_add")
    return item


def _build_nav_sections() -> list[dict[str, Any]]:
    """Curated index navigation — only models a regular admin operates.

    Grouped by workflow with a live row count per model. Internal/relational
    models (campaign actions/rules, group sessions, QR tokens, reward
    transactions, …) are deliberately excluded here; they stay registered and
    reachable by URL or FK drill-in but are kept off the admin landing page so
    operators aren't drowned.
    """
    return [
        {"title": "Onboarding & businesses", "items": [
            _nav_item("businesses_business", "Businesses", Business.objects.count(), add=True),
            _nav_item("businesses_businessnote", "Business notes", BusinessNote.objects.count()),
            _nav_item("businesses_businessownerinvite", "Owner invites", BusinessOwnerInvite.objects.count()),
            _nav_item("businesses_staffinvite", "Staff invites", StaffInvite.objects.count()),
            _nav_item("businesses_businesstype", "Business types", add=True),
            _nav_item("businesses_catalogitem", "Catalog items"),
        ]},
        {"title": "Customers & staff", "items": [
            _nav_item("accounts_user", "Users", User.objects.count(), add=True),
            _nav_item("accounts_customerprofile", "Customer profiles", CustomerProfile.objects.count()),
            _nav_item("staff_staffmember", "Staff members", StaffMember.objects.count(), add=True),
        ]},
        {"title": "Loyalty & campaigns", "items": [
            _nav_item("loyalty_rewardprogram", "Reward programs", RewardProgram.objects.count(), add=True),
            _nav_item("loyalty_rewardredemption", "Redemptions", RewardRedemption.objects.count()),
            _nav_item("campaigns_campaign", "Campaigns", Campaign.objects.count(), add=True),
            _nav_item("campaigns_campaignrewardvoucher", "Campaign vouchers", CampaignRewardVoucher.objects.count()),
            _nav_item("groups_groupoffer", "Group offers", GroupOffer.objects.count(), add=True),
        ]},
        {"title": "System & audit", "items": [
            _nav_item("qr_scanlog", "Scan log"),
            _nav_item("reporting_adminauditlog", "Admin audit log"),
            _nav_item("system_systemconfiguration", "System config"),
        ]},
    ]


def _compute_dashboard_metrics() -> dict[str, Any]:
    """Compute the aggregate-heavy dashboard context (KPI tiles, charts, legend).

    This is the expensive part (~7 count/group-by/trunc queries) and is what gets
    cached. It holds only JSON-serialisable, pickle-safe data — no model
    instances — so the live queues stay outside the cache.
    """
    since = timezone.now() - timedelta(days=RECENT_WINDOW_DAYS)
    window = f"last {RECENT_WINDOW_DAYS} days"
    business_url = reverse("admin:businesses_business_changelist")

    # --- KPI tiles ---
    pending_reviews = Business.objects.filter(status=Business.Status.PENDING).count()
    new_businesses = Business.objects.filter(created_at__gte=since).count()
    vouchers_redeemed = CampaignRewardVoucher.objects.filter(redeemed_at__gte=since).count()
    scans = ScanLog.objects.filter(created_at__gte=since).count()
    kpi_cards = [
        {"label": "Pending reviews", "value": pending_reviews, "sub": "needs action",
         "icon": "fact_check", "gradient": _GRAD_CLAY,
         "url": f"{business_url}?status__exact={Business.Status.PENDING}"},
        {"label": "New businesses", "value": new_businesses, "sub": window,
         "icon": "storefront", "gradient": _GRAD_AMBER, "url": business_url},
        {"label": "Vouchers redeemed", "value": vouchers_redeemed, "sub": window,
         "icon": "confirmation_number", "gradient": _GRAD_ROSE,
         "url": reverse("admin:campaigns_campaignrewardvoucher_changelist")},
        {"label": "QR scans", "value": scans, "sub": window,
         "icon": "qr_code_2", "gradient": _GRAD_ESPRESSO,
         "url": reverse("admin:qr_scanlog_changelist")},
    ]

    mini_stats = [
        {"label": "Businesses", "value": Business.objects.count(),
         "icon": "store", "url": business_url},
        {"label": "Customers", "value": User.objects.filter(role=User.Role.CUSTOMER).count(),
         "icon": "group", "url": reverse("admin:accounts_user_changelist")},
        {"label": "Active campaigns", "value": Campaign.objects.filter(status=Campaign.Status.ACTIVE).count(),
         "icon": "campaign", "url": reverse("admin:campaigns_campaign_changelist")},
    ]

    # --- hero chart: new signups per month (customers + businesses) ---
    months = _last_months(SIGNUP_CHART_MONTHS)
    labels = [calendar.month_abbr[m] for (_, m) in months]
    customer_by_month = _monthly_counts(User)  # all users; customers dominate signups
    business_by_month = _monthly_counts(Business)
    customer_series = [customer_by_month.get(m, 0) for m in months]
    business_series = [business_by_month.get(m, 0) for m in months]
    signup_chart_data = json.dumps({
        "labels": labels,
        "datasets": [
            {"label": "Customers", "data": customer_series,
             "borderColor": "#C25E3C", "backgroundColor": "rgba(194, 94, 60, 0.15)",
             "fill": True, "tension": 0.4},
            {"label": "Businesses", "data": business_series,
             "borderColor": "#C9772F", "backgroundColor": "rgba(201, 119, 47, 0.08)",
             "fill": True, "tension": 0.4},
        ],
    })
    signup_chart_options = json.dumps({
        "responsive": True, "maintainAspectRatio": False,
        "plugins": {"legend": {"display": False}},
        "scales": {"x": {"grid": {"display": False}}, "y": {"display": False, "beginAtZero": True}},
    })

    # --- businesses-by-status doughnut ---
    status_map = {r["status"]: r["c"] for r in Business.objects.values("status").annotate(c=Count("id"))}
    status_labels = [Business.Status(s).label for s in _STATUS_COLORS]
    status_values = [status_map.get(s, 0) for s in _STATUS_COLORS]
    status_colors = list(_STATUS_COLORS.values())
    status_chart_data = json.dumps({
        "labels": status_labels,
        "datasets": [{"data": status_values, "backgroundColor": status_colors, "borderWidth": 0}],
    })
    status_chart_options = json.dumps({
        "responsive": True, "maintainAspectRatio": False, "cutout": "70%",
        "plugins": {"legend": {"display": False}},
    })
    status_legend = [
        {"label": label, "value": value, "color": color}
        for label, value, color in zip(status_labels, status_values, status_colors)
    ]

    return {
        "kpi_cards": kpi_cards,
        "mini_stats": mini_stats,
        # Headline = total new signups across the plotted window.
        "signup_headline": sum(customer_series) + sum(business_series),
        "signup_headline_label": f"New signups — last {SIGNUP_CHART_MONTHS} months",
        "signup_chart_data": signup_chart_data,
        "signup_chart_options": signup_chart_options,
        "status_chart_data": status_chart_data,
        "status_chart_options": status_chart_options,
        "status_legend": status_legend,
        "nav_sections": _build_nav_sections(),
    }


def dashboard_callback(request: Any, context: dict[str, Any]) -> dict[str, Any]:
    """Populate the admin index with operational metrics, charts, and queues.

    The aggregate-heavy metrics (KPI counts, charts, status breakdown) are cached
    in Redis for ``DASHBOARD_CACHE_TTL`` seconds via :func:`_compute_dashboard_metrics`
    so repeated index loads don't re-run ~7 aggregate queries each time; a fresh
    business or scan shows up within the TTL. The pending review queue and the
    activity feed are queried live (two cheap ``select_related`` reads) so they
    never feel stale. Returns the mutated context.
    """
    metrics = cache.get(DASHBOARD_CACHE_KEY)
    if metrics is None:
        metrics = _compute_dashboard_metrics()
        cache.set(DASHBOARD_CACHE_KEY, metrics, DASHBOARD_CACHE_TTL)
    context.update(metrics)

    # --- live (uncached) pending review queue + onboarding pipeline + activity ---
    context["review_queue"] = list(
        Business.objects.filter(status=Business.Status.PENDING)
        .select_related("owner")
        .order_by("-created_at")[:REVIEW_QUEUE_LIMIT]
    )
    # Businesses actively onboarding (post-approval profile completion). SUBMITTED
    # ones await verification; CHANGES_REQUESTED are back with the owner.
    context["onboarding_queue"] = list(
        Business.objects.filter(onboarding_status__in=[
            Business.OnboardingStatus.IN_PROGRESS,
            Business.OnboardingStatus.SUBMITTED,
            Business.OnboardingStatus.CHANGES_REQUESTED,
        ])
        .select_related("owner")
        .order_by("-updated_at")[:ONBOARDING_QUEUE_LIMIT]
    )
    context["dashboard_recent"] = list(
        AdminAuditLog.objects.select_related("admin").order_by("-created_at")[:RECENT_ACTIVITY_LIMIT]
    )
    return context


def pending_businesses_badge(request: Any) -> Optional[int]:
    """Sidebar badge: count of businesses awaiting review, or None when zero.

    Cached for ``DASHBOARD_CACHE_TTL`` so the count doesn't issue a query on every
    admin page render (the sidebar is on every page). Returns None when zero so
    the badge is hidden when there is no pending work.
    """
    count = cache.get(BADGE_CACHE_KEY)
    if count is None:
        count = Business.objects.filter(status=Business.Status.PENDING).count()
        cache.set(BADGE_CACHE_KEY, count, DASHBOARD_CACHE_TTL)
    return count or None
