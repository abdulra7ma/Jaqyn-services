"""Smoke tests for the unfold-themed admin: index dashboard renders and the
business changelist (with the BusinessNote inline) loads.

These guard the wiring that has no other test surface: the UNFOLD settings dict,
the DASHBOARD_CALLBACK, the admin/index.html override, and every sidebar nav
``reverse()`` resolving to a registered changelist.
"""
from unittest.mock import patch

import pytest
from django.test import Client
from django.urls import reverse

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.reporting import dashboard
from apps.reporting.dashboard import dashboard_callback, pending_businesses_badge

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    User.objects.create_superuser(phone="+996709000010", password="secret")
    client = Client()
    client.force_login(User.objects.get(phone="+996709000010"))
    return client


def test_admin_index_renders_dashboard_widgets(admin_client):
    Business.objects.create(name="Pending One", status=Business.Status.PENDING)

    res = admin_client.get(reverse("admin:index"))

    assert res.status_code == 200
    body = res.content.decode()
    # KPI tiles, hero chart, doughnut, and both bottom panels are present.
    assert "Pending reviews" in body
    assert "New signups" in body
    assert 'data-type="line"' in body
    assert 'data-type="doughnut"' in body
    assert "Businesses by status" in body
    assert "Pending review queue" in body
    # The pending business surfaces in the review queue.
    assert "Pending One" in body
    # Curated nav sections replace the flat app dump; internal models stay off it.
    assert "Onboarding &amp; businesses" in body
    assert "Loyalty &amp; campaigns" in body
    assert "Campaign actions" not in body
    assert "Reward transactions" not in body
    # Inline actions + onboarding pipeline are present.
    assert "Onboarding pipeline" in body
    assert 'value="approve"' in body


def test_business_changelist_renders(admin_client):
    res = admin_client.get(reverse("admin:businesses_business_changelist"))
    assert res.status_code == 200


def test_pending_businesses_badge_counts_pending_only():
    Business.objects.create(name="P1", status=Business.Status.PENDING)
    Business.objects.create(name="P2", status=Business.Status.PENDING)
    Business.objects.create(name="A1", status=Business.Status.APPROVED)

    assert pending_businesses_badge(request=None) == 2


def test_pending_businesses_badge_none_when_zero():
    assert pending_businesses_badge(request=None) is None


class TestDashboardInlineActions:
    """The dashboard queue buttons POST to BusinessAdmin.dashboard_action_view."""

    def _action_url(self, biz):
        return reverse("admin:businesses_business_dashboard_action", args=[biz.pk])

    def test_approve_transitions_and_redirects(self, admin_client):
        biz = Business.objects.create(name="Approve Me", status=Business.Status.PENDING)
        res = admin_client.post(self._action_url(biz), {"action": "approve"})
        assert res.status_code == 302
        biz.refresh_from_db()
        assert biz.status == Business.Status.APPROVED

    def test_reject_records_reason_note(self, admin_client):
        biz = Business.objects.create(name="Reject Me", status=Business.Status.PENDING)
        admin_client.post(self._action_url(biz), {"action": "reject", "text": "Bad photos"})
        biz.refresh_from_db()
        assert biz.status == Business.Status.REJECTED
        assert "Bad photos" in biz.notes.first().body

    def test_comment_adds_internal_note(self, admin_client):
        biz = Business.objects.create(name="Note Me", status=Business.Status.PENDING)
        admin_client.post(self._action_url(biz), {"action": "comment", "text": "Called owner"})
        note = biz.notes.get()
        assert note.body == "Called owner"

    def test_verify_completes_onboarding(self, admin_client):
        biz = Business.objects.create(name="Verify Me", onboarding_status=Business.OnboardingStatus.SUBMITTED)
        admin_client.post(self._action_url(biz), {"action": "verify"})
        biz.refresh_from_db()
        assert biz.onboarding_status == Business.OnboardingStatus.COMPLETED

    def test_request_changes_sends_back(self, admin_client):
        biz = Business.objects.create(name="Fix Me", onboarding_status=Business.OnboardingStatus.SUBMITTED)
        admin_client.post(self._action_url(biz), {"action": "request_changes", "text": "Add hours"})
        biz.refresh_from_db()
        assert biz.onboarding_status == Business.OnboardingStatus.CHANGES_REQUESTED
        assert biz.change_note == "Add hours"

    def test_get_not_allowed(self, admin_client):
        biz = Business.objects.create(name="GET Me", status=Business.Status.PENDING)
        assert admin_client.get(self._action_url(biz)).status_code == 405

    def test_anonymous_redirected_to_login(self):
        biz = Business.objects.create(name="Anon", status=Business.Status.PENDING)
        res = Client().post(reverse("admin:businesses_business_dashboard_action", args=[biz.pk]), {"action": "approve"})
        assert res.status_code == 302
        assert "/login" in res["Location"]
        biz.refresh_from_db()
        assert biz.status == Business.Status.PENDING


def test_trials_expiring_widget_and_kpi(admin_client):
    from datetime import timedelta

    from django.utils import timezone

    Business.objects.create(name="Expiring Soon Cafe", trial_ends_at=timezone.now() + timedelta(days=3))
    res = admin_client.get(reverse("admin:index"))
    body = res.content.decode()
    assert "Trials expiring" in body  # KPI tile
    assert "Trials expiring soon" in body  # queue panel
    assert "Expiring Soon Cafe" in body


def test_create_demo_button_on_changelist(admin_client):
    res = admin_client.get(reverse("admin:businesses_business_changelist"))
    assert res.status_code == 200
    assert "Create demo business" in res.content.decode()


def test_dashboard_metrics_are_cached_between_loads():
    # First call computes + caches; second call must hit the cache and NOT recompute.
    spy = patch.object(
        dashboard, "_compute_dashboard_metrics", wraps=dashboard._compute_dashboard_metrics
    )
    with spy as mock_compute:
        dashboard_callback(request=None, context={})
        dashboard_callback(request=None, context={})
        assert mock_compute.call_count == 1
