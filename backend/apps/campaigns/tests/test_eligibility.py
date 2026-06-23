"""Eligibility pipeline invariants (plan §13).

Each §13 check must reject for the right reason. These tests back the docstrings
on ``CampaignEligibilityService``.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.campaigns.models import (
    Campaign,
    CampaignAction,
    CampaignParticipant,
    CampaignRewardVoucher,
)
from apps.campaigns.services import (
    CampaignEligibilityService,
    IneligibilityReason,
)
from apps.campaigns.tests.helpers import make_business, make_campaign, make_customer


pytestmark = pytest.mark.django_db


def _participant(campaign, customer):
    return CampaignParticipant.objects.create(
        campaign=campaign,
        customer=customer,
        status=CampaignParticipant.Status.IN_PROGRESS,
        joined_at=timezone.now(),
    )


def test_active_campaign_with_open_window_is_eligible():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business)

    result = CampaignEligibilityService.evaluate(campaign, customer.id)

    assert result.eligible is True
    assert result.reason is None


def test_paused_campaign_rejected_not_active():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, status=Campaign.Status.PAUSED)

    result = CampaignEligibilityService.evaluate(campaign, customer.id)

    assert result.eligible is False
    assert result.reason is IneligibilityReason.NOT_ACTIVE
    assert result.reason_code == "CAMPAIGN_NOT_ACTIVE"


def test_outside_date_window_rejected():
    business = make_business()
    customer = make_customer()
    now = timezone.now()
    campaign = make_campaign(business, start_at=now + timedelta(days=1))

    result = CampaignEligibilityService.evaluate(campaign, customer.id, now=now)

    assert result.eligible is False
    assert result.reason is IneligibilityReason.OUTSIDE_WINDOW


def test_outside_time_of_day_window_rejected():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business)
    # Narrow the time window to a slot that excludes "now".
    now = timezone.now()
    campaign.active_start_time = (now + timedelta(hours=2)).time()
    campaign.active_end_time = (now + timedelta(hours=3)).time()
    campaign.save(update_fields=["active_start_time", "active_end_time"])

    result = CampaignEligibilityService.evaluate(campaign, customer.id, now=now)

    assert result.eligible is False
    assert result.reason is IneligibilityReason.OUTSIDE_WINDOW


def test_daily_limit_rejected():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, required_count=5, max_count_per_day=1)
    participant = _participant(campaign, customer)
    CampaignAction.objects.create(
        campaign=campaign,
        participant=participant,
        customer=customer,
        business=business,
        action_type=CampaignAction.ActionType.VISIT,
        action_time=timezone.now(),
        status=CampaignAction.Status.COUNTED,
    )

    result = CampaignEligibilityService.evaluate(campaign, customer.id, participant)

    assert result.eligible is False
    assert result.reason is IneligibilityReason.DAILY_LIMIT


def test_min_gap_rejected():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(
        business, required_count=5, minimum_gap=timedelta(minutes=30)
    )
    participant = _participant(campaign, customer)
    now = timezone.now()
    CampaignAction.objects.create(
        campaign=campaign,
        participant=participant,
        customer=customer,
        business=business,
        action_type=CampaignAction.ActionType.VISIT,
        action_time=now - timedelta(minutes=5),
        status=CampaignAction.Status.COUNTED,
    )

    result = CampaignEligibilityService.evaluate(
        campaign, customer.id, participant, now=now
    )

    assert result.eligible is False
    assert result.reason is IneligibilityReason.MIN_GAP


def test_reward_cap_rejected():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, max_rewards=1)
    reward = campaign.reward
    # Consume the single reward slot with an ACTIVE voucher for another customer.
    other = make_customer("002")
    CampaignRewardVoucher.objects.create(
        campaign=campaign,
        customer=other,
        business=business,
        reward=reward,
        voucher_code="CAPCODE1",
        status=CampaignRewardVoucher.Status.ACTIVE,
    )

    result = CampaignEligibilityService.evaluate(campaign, customer.id)

    assert result.eligible is False
    assert result.reason is IneligibilityReason.REWARD_LIMIT


def test_cancelled_voucher_does_not_consume_reward_cap():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, max_rewards=1)
    reward = campaign.reward
    CampaignRewardVoucher.objects.create(
        campaign=campaign,
        customer=make_customer("003"),
        business=business,
        reward=reward,
        voucher_code="CANCEL01",
        status=CampaignRewardVoucher.Status.CANCELLED,
    )

    result = CampaignEligibilityService.evaluate(campaign, customer.id)

    # Cancelled voucher frees the slot (plan Q5) → still eligible.
    assert result.eligible is True


def test_participant_limit_rejected_for_new_joiner():
    business = make_business()
    campaign = make_campaign(business, max_participants=1)
    # Existing participant fills the only slot.
    _participant(campaign, make_customer("004"))
    new_customer = make_customer("005")

    result = CampaignEligibilityService.evaluate(campaign, new_customer.id, None)

    assert result.eligible is False
    assert result.reason is IneligibilityReason.PARTICIPANT_LIMIT


def test_once_campaign_rejects_completed_participant():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, completion_limit=Campaign.CompletionLimit.ONCE)
    participant = _participant(campaign, customer)
    participant.status = CampaignParticipant.Status.COMPLETED
    participant.save(update_fields=["status"])

    result = CampaignEligibilityService.evaluate(campaign, customer.id, participant)

    assert result.eligible is False
    assert result.reason is IneligibilityReason.ALREADY_COMPLETED


def test_repeatable_campaign_allows_completed_participant():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(
        business, completion_limit=Campaign.CompletionLimit.REPEATABLE
    )
    participant = _participant(campaign, customer)
    participant.status = CampaignParticipant.Status.COMPLETED
    participant.save(update_fields=["status"])

    result = CampaignEligibilityService.evaluate(campaign, customer.id, participant)

    assert result.eligible is True
