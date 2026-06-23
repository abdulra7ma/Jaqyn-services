"""Celery task and notification-routing invariants for campaigns (plan §1.4).

Covers the BE-4 surface: the periodic lifecycle/expiry/fraud tasks delegate to
their services; the notify_* tasks write a NotificationLog through the campaign
event router; the "expiring soon" / "ending soon" claim methods are idempotent
(warn at most once); and the campaign-updates preference gates campaign messages.

Tasks run inline because CELERY_TASK_ALWAYS_EAGER is set in the test settings.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.campaigns import tasks
from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignRewardVoucher,
)
from apps.campaigns.services import CampaignRewardService
from apps.campaigns.tests.helpers import make_business, make_campaign, make_customer
from apps.notifications.models import NotificationLog, NotificationPreference

pytestmark = pytest.mark.django_db


def _issue_voucher(campaign, customer, *, expires_at):
    """Mint a voucher then force its expiry window for warning/expiry tests."""
    voucher = CampaignRewardService.issue_reward_voucher(
        campaign=campaign, reward=campaign.reward, customer=customer
    )
    CampaignRewardVoucher.objects.filter(id=voucher.id).update(expires_at=expires_at)
    return CampaignRewardVoucher.objects.get(id=voucher.id)


# --- periodic tasks delegate to services ---------------------------------------


def test_expire_campaign_vouchers_task_expires_overdue():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business)
    _issue_voucher(campaign, customer, expires_at=timezone.now() - timedelta(hours=1))

    expired = tasks.expire_campaign_vouchers()

    assert expired == 1
    assert (
        CampaignRewardVoucher.objects.get(campaign=campaign).status
        == CampaignRewardVoucher.Status.EXPIRED
    )


def test_transition_lifecycle_task_returns_counts():
    business = make_business()
    now = timezone.now()
    make_campaign(
        business, status=Campaign.Status.SCHEDULED, start_at=now - timedelta(hours=1)
    )
    make_campaign(
        business, status=Campaign.Status.ACTIVE, end_at=now - timedelta(hours=1)
    )

    counts = tasks.transition_campaign_lifecycle()

    assert counts == {"activated": 1, "ended": 1}


def test_sweep_campaign_fraud_task_runs():
    # No abusive activity → nothing flagged, but the task path is exercised.
    assert tasks.sweep_campaign_fraud() == 0


# --- per-customer notify tasks -------------------------------------------------


def test_notify_visit_counted_writes_log():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business)

    result = tasks.notify_visit_counted(str(customer.id), str(campaign.id))

    log = NotificationLog.objects.get(id=result["log_id"])
    assert log.event == "campaign_visit_counted"
    assert log.status == NotificationLog.Status.SENT
    assert log.payload["campaign_id"] == str(campaign.id)


def test_notify_reward_unlocked_writes_log():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business)
    voucher = _issue_voucher(
        campaign, customer, expires_at=timezone.now() + timedelta(days=7)
    )

    result = tasks.notify_reward_unlocked(str(customer.id), str(voucher.id))

    log = NotificationLog.objects.get(id=result["log_id"])
    assert log.event == "campaign_reward_unlocked"
    assert log.payload["code"] == voucher.voucher_code


def test_campaign_updates_preference_skips_campaign_messages():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business)
    NotificationPreference.objects.create(user=customer, campaign_updates=False)

    result = tasks.notify_visit_counted(str(customer.id), str(campaign.id))

    log = NotificationLog.objects.get(id=result["log_id"])
    assert log.status == NotificationLog.Status.SKIPPED


# --- expiring-soon fan-out + idempotency ---------------------------------------


def test_notify_vouchers_expiring_soon_warns_once():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business)
    voucher = _issue_voucher(
        campaign, customer, expires_at=timezone.now() + timedelta(hours=6)
    )

    first = tasks.notify_vouchers_expiring_soon()
    second = tasks.notify_vouchers_expiring_soon()

    assert first == 1
    # Second sweep claims nothing — the voucher is already marked warned.
    assert second == 0
    assert CampaignRewardVoucher.objects.get(id=voucher.id).expiry_warned_at is not None
    assert NotificationLog.objects.filter(event="campaign_voucher_expiring").count() == 1


def test_expiring_soon_ignores_far_and_already_expired_vouchers():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business)
    # Outside the 24h warning window.
    _issue_voucher(campaign, customer, expires_at=timezone.now() + timedelta(days=5))
    # Already expired → expiry task's job, not a warning.
    _issue_voucher(campaign, customer, expires_at=timezone.now() - timedelta(hours=1))

    assert tasks.notify_vouchers_expiring_soon() == 0
    assert not NotificationLog.objects.filter(event="campaign_voucher_expiring").exists()


# --- campaign-ending fan-out + idempotency -------------------------------------


def test_notify_campaigns_ending_soon_warns_active_participants_once():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(
        business, end_at=timezone.now() + timedelta(hours=6)
    )
    CampaignParticipant.objects.create(
        campaign=campaign,
        customer=customer,
        status=CampaignParticipant.Status.IN_PROGRESS,
        joined_at=timezone.now(),
    )

    first = tasks.notify_campaigns_ending_soon()
    second = tasks.notify_campaigns_ending_soon()

    assert first == 1
    assert second == 0
    assert Campaign.objects.get(id=campaign.id).ending_warned_at is not None
    assert NotificationLog.objects.filter(event="campaign_ending").count() == 1


def test_campaign_ending_skips_completed_participants():
    business = make_business()
    finisher = make_customer("701")
    in_progress = make_customer("702")
    campaign = make_campaign(business, end_at=timezone.now() + timedelta(hours=6))
    CampaignParticipant.objects.create(
        campaign=campaign,
        customer=finisher,
        status=CampaignParticipant.Status.COMPLETED,
        joined_at=timezone.now(),
    )
    CampaignParticipant.objects.create(
        campaign=campaign,
        customer=in_progress,
        status=CampaignParticipant.Status.JOINED,
        joined_at=timezone.now(),
    )

    result = tasks.notify_campaign_ending(str(campaign.id))

    # Only the still-in-progress participant is nudged.
    assert result == {"recipients": 1}
    assert NotificationLog.objects.filter(
        event="campaign_ending", recipient=in_progress
    ).exists()
    assert not NotificationLog.objects.filter(
        event="campaign_ending", recipient=finisher
    ).exists()


def test_ending_soon_ignores_non_active_and_out_of_window():
    business = make_business()
    # Active but ends well beyond the warning window.
    make_campaign(business, end_at=timezone.now() + timedelta(days=10))
    # Within window but not ACTIVE.
    make_campaign(
        business,
        status=Campaign.Status.PAUSED,
        end_at=timezone.now() + timedelta(hours=6),
    )

    assert tasks.notify_campaigns_ending_soon() == 0
