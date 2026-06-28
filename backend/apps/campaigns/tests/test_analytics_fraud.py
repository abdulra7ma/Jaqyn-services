"""Analytics roll-up and fraud-flag invariants (plan §8.2 / §15)."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.campaigns.models import CampaignAction, CampaignParticipant
from apps.campaigns.services import (
    CampaignAnalyticsService,
    CampaignProgressService,
    CampaignRewardService,
    FraudService,
)
from apps.campaigns.constants import STAFF_ABUSE_MAX_CONFIRMS
from apps.reporting.models import AdminAuditLog
from apps.campaigns.tests.helpers import (
    make_business,
    make_campaign,
    make_customer,
    make_staff,
)


pytestmark = pytest.mark.django_db


def test_campaign_metrics_counts_and_cost():
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1, estimated_cost="3.50")

    c1 = make_customer("701")
    c2 = make_customer("702")
    # c1 completes (issues a voucher) and redeems it; c2 completes only.
    r1 = CampaignProgressService.record_campaign_action(campaign, c1, staff=staff)
    CampaignProgressService.record_campaign_action(campaign, c2, staff=staff)
    CampaignRewardService.redeem_reward_voucher(staff, code=r1.voucher.voucher_code)

    metrics = CampaignAnalyticsService.campaign_metrics(campaign)

    assert metrics.joined == 2
    assert metrics.completed == 2
    assert metrics.issued == 2
    assert metrics.redeemed == 1
    assert metrics.redemption_rate == 0.5
    assert metrics.estimated_cost == Decimal("7.00")  # 2 issued * 3.50


def test_new_vs_returning_split():
    business = make_business()
    returning = make_customer("711")
    new = make_customer("712")
    # Returning customer has an earlier participation in another campaign.
    earlier = make_campaign(business)
    CampaignParticipant.objects.create(
        campaign=earlier,
        customer=returning,
        status=CampaignParticipant.Status.JOINED,
    )
    campaign = make_campaign(business)
    CampaignProgressService.join_campaign(campaign, returning)
    CampaignProgressService.join_campaign(campaign, new)

    metrics = CampaignAnalyticsService.campaign_metrics(campaign)

    assert metrics.returning_customers == 1
    assert metrics.new_customers == 1


def test_detect_duplicate_visit_signal():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(
        business, required_count=5, minimum_gap=timedelta(minutes=30)
    )
    participant = CampaignParticipant.objects.create(
        campaign=campaign,
        customer=customer,
        status=CampaignParticipant.Status.IN_PROGRESS,
    )
    now = timezone.now()
    CampaignAction.objects.create(
        campaign=campaign,
        participant=participant,
        customer=customer,
        business=business,
        action_time=now - timedelta(minutes=5),
        status=CampaignAction.Status.COUNTED,
    )

    signal = FraudService.detect_duplicate_visit(campaign, customer.id, now)

    assert signal is not None
    assert signal.kind == "duplicate_visit"


def test_staff_abuse_flag_writes_audit():
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=100, minimum_gap=timedelta(0))
    now = timezone.now()
    participant = CampaignParticipant.objects.create(
        campaign=campaign,
        customer=make_customer("721"),
        status=CampaignParticipant.Status.IN_PROGRESS,
    )
    # Seed STAFF_ABUSE_MAX_CONFIRMS counted actions verified by this staff.
    for _ in range(STAFF_ABUSE_MAX_CONFIRMS):
        CampaignAction.objects.create(
            campaign=campaign,
            participant=participant,
            customer=participant.customer,
            business=business,
            verified_by_staff=staff,
            action_time=now,
            status=CampaignAction.Status.COUNTED,
        )

    signal = FraudService.detect_staff_abuse(staff, now)
    assert signal is not None

    FraudService.flag_suspicious_activity(signal, business)
    assert AdminAuditLog.objects.filter(
        action="campaign_fraud_flagged", target_id=str(staff.id)
    ).exists()


def test_fraud_sweep_flags_abusive_staff():
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=100, minimum_gap=timedelta(0))
    now = timezone.now()
    participant = CampaignParticipant.objects.create(
        campaign=campaign,
        customer=make_customer("731"),
        status=CampaignParticipant.Status.IN_PROGRESS,
    )
    for _ in range(STAFF_ABUSE_MAX_CONFIRMS):
        CampaignAction.objects.create(
            campaign=campaign,
            participant=participant,
            customer=participant.customer,
            business=business,
            verified_by_staff=staff,
            action_time=now,
            status=CampaignAction.Status.COUNTED,
        )

    flagged = FraudService.sweep(now)

    assert flagged == 1
