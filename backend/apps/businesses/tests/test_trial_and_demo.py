"""Tests for the free-trial lifecycle and one-click demo business seeding."""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.demo_services import DEMO_OWNER_PASSWORD, create_demo_business
from apps.businesses.models import Business
from apps.businesses.services import approve_business
from apps.businesses.trial_services import expiring_trials, start_trial, trial_status
from apps.campaigns.models import Campaign
from apps.system.models import SystemConfiguration

pytestmark = pytest.mark.django_db


def _business(**kw) -> Business:
    return Business.objects.create(name=kw.pop("name", "Trial Co"), **kw)


class TestTrialStatus:
    def test_no_trial_when_no_end_date(self):
        st = trial_status(_business())
        assert st.badge == "" and not st.active and not st.expired

    def test_active_trial_badge_counts_days(self):
        biz = _business(trial_ends_at=timezone.now() + timedelta(days=10, hours=1))
        st = trial_status(biz)
        assert st.active and not st.expired
        assert st.days_left == 11  # ceil of 10d1h
        assert "11d left" in st.badge

    def test_expired_trial(self):
        biz = _business(trial_ends_at=timezone.now() - timedelta(days=1))
        st = trial_status(biz)
        assert st.expired and not st.active
        assert st.badge == "Trial ended"

    def test_demo_and_paid_have_no_trial(self):
        end = timezone.now() + timedelta(days=5)
        assert trial_status(_business(is_demo=True, trial_ends_at=end)).badge == ""
        assert trial_status(_business(is_paid=True, trial_ends_at=end)).badge == ""


class TestStartTrial:
    def test_uses_config_length(self):
        cfg = SystemConfiguration.load()
        cfg.trial_period_days = 14
        cfg.save()
        biz = _business()
        start_trial(biz)
        assert biz.trial_started_at is not None
        delta = (biz.trial_ends_at - biz.trial_started_at).days
        assert delta == 14

    def test_skips_demo_and_is_idempotent(self):
        demo = _business(is_demo=True)
        start_trial(demo)
        assert demo.trial_started_at is None

        biz = _business()
        start_trial(biz)
        first_end = biz.trial_ends_at
        start_trial(biz)  # second call must not move the window
        assert biz.trial_ends_at == first_end


class TestApproveStartsTrial:
    def test_approve_starts_trial(self):
        biz = _business(status=Business.Status.PENDING)
        approve_business(biz)
        biz.refresh_from_db()
        assert biz.trial_started_at is not None
        assert biz.trial_ends_at > timezone.now()

    def test_approve_demo_does_not_start_trial(self):
        biz = _business(status=Business.Status.PENDING, is_demo=True)
        approve_business(biz)
        biz.refresh_from_db()
        assert biz.trial_started_at is None


class TestExpiringTrials:
    def test_only_active_trials_within_window(self):
        now = timezone.now()
        soon = _business(name="Soon", trial_ends_at=now + timedelta(days=3))
        _business(name="Later", trial_ends_at=now + timedelta(days=20))
        _business(name="Expired", trial_ends_at=now - timedelta(days=1))
        _business(name="DemoSoon", is_demo=True, trial_ends_at=now + timedelta(days=2))
        _business(name="PaidSoon", is_paid=True, trial_ends_at=now + timedelta(days=2))

        ids = set(expiring_trials().values_list("id", flat=True))
        assert ids == {soon.id}


class TestCreateDemoBusiness:
    def test_creates_full_demo(self):
        result = create_demo_business()
        biz = result.business
        assert biz.is_demo is True
        assert biz.status == Business.Status.APPROVED
        assert biz.onboarding_status == Business.OnboardingStatus.COMPLETED
        # Owner login works with the documented demo password.
        owner = User.objects.get(email=result.owner_email)
        assert owner.role == User.Role.BUSINESS_OWNER
        assert owner.check_password(DEMO_OWNER_PASSWORD)
        # Seeded campaign (loyalty card → INDIVIDUAL campaign) + catalog.
        assert Campaign.objects.filter(business=biz, campaign_type=Campaign.CampaignType.INDIVIDUAL).exists()
        assert biz.catalog_items.count() == 3

    def test_each_call_is_unique(self):
        a = create_demo_business()
        b = create_demo_business()
        assert a.owner_email != b.owner_email
        assert a.business.id != b.business.id
