"""Tests for the dedicated admin analytics page and its datasets."""
from decimal import Decimal

import pytest
from django.test import Client
from django.urls import reverse

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.qr.models import ScanLog
from apps.reporting.analytics import analytics_context

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    User.objects.create_superuser(phone="+996709000020", password="secret")
    c = Client()
    c.force_login(User.objects.get(phone="+996709000020"))
    return c


def _scan(business, status=ScanLog.Status.SUCCESS):
    return ScanLog.objects.create(business=business, status=status, action="collect")


class TestAnalyticsContext:
    def test_funnel_stage_counts(self):
        Business.objects.create(name="Lead Only", status=Business.Status.PENDING)
        Business.objects.create(name="Approved One", status=Business.Status.APPROVED,
                                verification_status=Business.VerificationStatus.VERIFIED)
        funnel = {s["label"]: s["value"] for s in analytics_context()["funnel"]}
        assert funnel["Leads"] == 2
        assert funnel["Approved"] == 1
        assert funnel["Verified"] == 1

    def test_leaderboard_orders_by_scans(self):
        busy = Business.objects.create(name="Busy")
        quiet = Business.objects.create(name="Quiet")
        for _ in range(3):
            _scan(busy)
        _scan(quiet)
        board = analytics_context()["leaderboard"]
        assert board[0]["name"] == "Busy" and board[0]["scans"] == 3

    def test_leaderboard_excludes_demo(self):
        demo = Business.objects.create(name="Demo Biz", is_demo=True)
        _scan(demo)
        names = {r["name"] for r in analytics_context()["leaderboard"]}
        assert "Demo Biz" not in names

    def test_map_points_only_with_coords(self):
        Business.objects.create(name="Mapped", latitude=Decimal("42.87"), longitude=Decimal("74.59"))
        Business.objects.create(name="Unmapped")
        ctx = analytics_context()
        assert ctx["map_count"] == 1
        assert "Mapped" in ctx["map_points_json"]
        assert "Unmapped" not in ctx["map_points_json"]

    def test_heatmap_shape(self):
        rows = analytics_context()["heatmap"]["rows"]
        assert len(rows) == 7
        assert all(len(r["cells"]) == 24 for r in rows)


class TestAnalyticsPage:
    def test_renders_for_staff(self, admin_client):
        res = admin_client.get(reverse("admin_analytics"))
        assert res.status_code == 200
        body = res.content.decode()
        for marker in ("Business map", "Conversion funnel", "Top businesses", "Scan heatmap", 'id="map"'):
            assert marker in body

    def test_requires_login(self):
        res = Client().get(reverse("admin_analytics"))
        assert res.status_code == 302
        assert "/login" in res["Location"] or "/admin" in res["Location"]
