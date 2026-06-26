"""Data + view for the dedicated admin analytics page (``/admin/analytics/``).

Heavier than the index dashboard (funnel, leaderboard, scan heatmap, category +
redemption charts, business map), so it lives on its own page that only loads when
opened, and the whole dataset is cached in Redis for ``ANALYTICS_CACHE_TTL``.
"""

import calendar
import json
from typing import Any

from django.contrib import admin
from django.core.cache import cache
from django.db.models import Count, Q
from django.db.models.functions import ExtractHour, ExtractIsoWeekDay, TruncMonth
from django.shortcuts import render
from django.utils import timezone

from apps.businesses.models import Business
from apps.campaigns.models import CampaignRewardVoucher
from apps.qr.models import ScanLog
from apps.reporting.dashboard import _last_months

ANALYTICS_CACHE_TTL = 300  # seconds; analytics queries are heavy, 5 min is fresh enough
ANALYTICS_CACHE_KEY = "admin:analytics:v1"
LEADERBOARD_LIMIT = 10
MAP_POINT_LIMIT = 500  # cap markers so the map payload stays small
REDEMPTION_MONTHS = 6

# Mon→Sun labels; ExtractIsoWeekDay returns 1 (Mon) … 7 (Sun).
_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _funnel() -> list[dict[str, Any]]:
    """Lead → approved → submitted → verified counts, each as a % of leads."""
    leads = Business.objects.count()
    stages = [
        ("Leads", leads),
        ("Approved", Business.objects.filter(status=Business.Status.APPROVED).count()),
        ("Onboarding submitted", Business.objects.filter(submitted_at__isnull=False).count()),
        ("Verified", Business.objects.filter(verification_status=Business.VerificationStatus.VERIFIED).count()),
    ]
    return [
        {"label": label, "value": value, "pct": round(value / leads * 100) if leads else 0}
        for label, value in stages
    ]


def _leaderboard() -> list[dict[str, Any]]:
    """Top businesses by successful scans, with their redemption counts.

    Excludes demo businesses. distinct=True on each aggregate so the two joins
    don't multiply each other's counts.
    """
    rows = (
        Business.objects.filter(is_demo=False)
        .annotate(
            scans=Count("scan_logs", filter=Q(scan_logs__status=ScanLog.Status.SUCCESS), distinct=True),
            redemptions=Count(
                "campaign_vouchers",
                filter=Q(campaign_vouchers__status=CampaignRewardVoucher.Status.REDEEMED),
                distinct=True,
            ),
        )
        .order_by("-scans", "-redemptions")[:LEADERBOARD_LIMIT]
    )
    return [{"name": b.name, "scans": b.scans, "redemptions": b.redemptions} for b in rows]


def _heatmap() -> dict[str, Any]:
    """Scan volume by weekday × hour as a colour-intensity grid."""
    counts = {
        (r["d"], r["h"]): r["c"]
        for r in ScanLog.objects.annotate(
            d=ExtractIsoWeekDay("created_at"), h=ExtractHour("created_at")
        ).values("d", "h").annotate(c=Count("id"))
    }
    peak = max(counts.values(), default=0)
    rows = []
    for iso_day, label in enumerate(_WEEKDAYS, start=1):
        cells = []
        for hour in range(24):
            count = counts.get((iso_day, hour), 0)
            cells.append({"count": count, "intensity": round(count / peak, 3) if peak else 0})
        rows.append({"label": label, "cells": cells})
    return {"rows": rows, "hours": list(range(24)), "peak": peak}


def _category_chart() -> tuple[str, str]:
    """Businesses-by-category bar chart (data, options) as JSON strings."""
    rows = (
        Business.objects.exclude(category="")
        .values("category").annotate(c=Count("id")).order_by("-c")
    )
    labels = [Business.Category(r["category"]).label for r in rows]
    data = [r["c"] for r in rows]
    chart_data = json.dumps({
        "labels": labels,
        "datasets": [{"label": "Businesses", "data": data, "backgroundColor": "#C25E3C", "borderRadius": 6}],
    })
    options = json.dumps({
        "responsive": True, "maintainAspectRatio": False,
        "plugins": {"legend": {"display": False}},
        "scales": {"x": {"grid": {"display": False}}, "y": {"beginAtZero": True, "ticks": {"precision": 0}}},
    })
    return chart_data, options


def _redemptions_chart() -> tuple[str, str]:
    """Reward redemptions per month (last REDEMPTION_MONTHS) as a line chart."""
    months = _last_months(REDEMPTION_MONTHS)
    by_month = {
        (r["m"].year, r["m"].month): r["c"]
        for r in CampaignRewardVoucher.objects.filter(status=CampaignRewardVoucher.Status.REDEEMED)
        .annotate(m=TruncMonth("redeemed_at")).values("m").annotate(c=Count("id"))
        if r["m"] is not None
    }
    labels = [calendar.month_abbr[m] for (_, m) in months]
    data = [by_month.get(key, 0) for key in months]
    chart_data = json.dumps({
        "labels": labels,
        "datasets": [{
            "label": "Redemptions", "data": data, "borderColor": "#9E3D52",
            "backgroundColor": "rgba(158, 61, 82, 0.15)", "fill": True, "tension": 0.4,
        }],
    })
    options = json.dumps({
        "responsive": True, "maintainAspectRatio": False,
        "plugins": {"legend": {"display": False}},
        "scales": {"x": {"grid": {"display": False}}, "y": {"beginAtZero": True, "ticks": {"precision": 0}}},
    })
    return chart_data, options


def _map_points() -> tuple[str, int]:
    """Businesses with coordinates as JSON for the Leaflet map (name, lat, lng, status)."""
    rows = (
        Business.objects.exclude(latitude__isnull=True).exclude(longitude__isnull=True)
        .values("name", "latitude", "longitude", "status")[:MAP_POINT_LIMIT]
    )
    points = [
        {"name": r["name"], "lat": float(r["latitude"]), "lng": float(r["longitude"]), "status": r["status"]}
        for r in rows
    ]
    return json.dumps(points), len(points)


def analytics_context() -> dict[str, Any]:
    """Assemble (and cache) every analytics widget's data in one pass."""
    cached = cache.get(ANALYTICS_CACHE_KEY)
    if cached is not None:
        return cached

    category_data, category_options = _category_chart()
    redemptions_data, redemptions_options = _redemptions_chart()
    map_points_json, map_count = _map_points()
    ctx = {
        "funnel": _funnel(),
        "leaderboard": _leaderboard(),
        "heatmap": _heatmap(),
        "category_chart_data": category_data,
        "category_chart_options": category_options,
        "redemptions_chart_data": redemptions_data,
        "redemptions_chart_options": redemptions_options,
        "map_points_json": map_points_json,
        "map_count": map_count,
        "generated_at": timezone.now(),
    }
    cache.set(ANALYTICS_CACHE_KEY, ctx, ANALYTICS_CACHE_TTL)
    return ctx


def analytics_view(request: Any):
    """Render the dedicated analytics page inside the themed admin shell.

    Wrapped by ``admin.site.admin_view`` at the URL layer (staff-only). Merges the
    admin's ``each_context`` so the unfold sidebar/header render, then the cached
    analytics datasets.
    """
    context = {
        **admin.site.each_context(request),
        "title": "Analytics",
        **analytics_context(),
    }
    return render(request, "admin/analytics.html", context)
