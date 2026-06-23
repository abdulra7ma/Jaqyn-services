"""Progress, completion, and priority-resolver invariants (plan §14 / §19)."""

from datetime import timedelta

import pytest

from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignRewardVoucher,
)
from apps.campaigns.services import (
    CampaignEligibilityService,
    CampaignProgressService,
)
from apps.campaigns.tests.helpers import make_business, make_campaign, make_customer
from core.exceptions import JaqynAPIException


pytestmark = pytest.mark.django_db


def test_single_visit_completes_and_issues_exactly_one_voucher():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, required_count=1)

    result = CampaignProgressService.record_campaign_action(campaign, customer)

    assert result.completed is True
    assert result.voucher is not None
    vouchers = CampaignRewardVoucher.objects.filter(campaign=campaign, customer=customer)
    assert vouchers.count() == 1
    voucher = vouchers.get()
    assert voucher.status == CampaignRewardVoucher.Status.ACTIVE
    assert voucher.qr_token is not None
    assert voucher.expires_at is not None
    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    assert participant.status == CampaignParticipant.Status.COMPLETED


def test_progress_increments_without_completing_until_required():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, required_count=3)

    first = CampaignProgressService.record_campaign_action(campaign, customer)

    assert first.completed is False
    assert first.progress_count == 1
    assert CampaignRewardVoucher.objects.filter(campaign=campaign).count() == 0


def test_over_cap_completion_issues_no_voucher():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, required_count=1, max_rewards=1)
    # Fill the single reward slot with an ACTIVE voucher for someone else.
    CampaignRewardVoucher.objects.create(
        campaign=campaign,
        customer=make_customer("099"),
        business=business,
        reward=campaign.reward,
        voucher_code="FULLCAP1",
        status=CampaignRewardVoucher.Status.ACTIVE,
    )

    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.record_campaign_action(campaign, customer)

    assert exc.value.code == "CAMPAIGN_REWARD_LIMIT_REACHED"
    # No voucher minted for this customer.
    assert not CampaignRewardVoucher.objects.filter(
        campaign=campaign, customer=customer
    ).exists()


def test_auto_join_on_first_visit_when_enabled():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, required_count=2, auto_join=True)

    CampaignProgressService.record_campaign_action(campaign, customer)

    assert CampaignParticipant.objects.filter(
        campaign=campaign, customer=customer
    ).exists()


def test_no_auto_join_rejected_when_disabled():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, required_count=2, auto_join=False)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.record_campaign_action(campaign, customer)

    assert exc.value.code == "CAMPAIGN_NOT_ELIGIBLE"


def test_repeatable_campaign_resets_and_re_earns():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(
        business,
        required_count=1,
        completion_limit=Campaign.CompletionLimit.REPEATABLE,
        minimum_gap=timedelta(0),
    )

    first = CampaignProgressService.record_campaign_action(campaign, customer)
    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)

    assert first.completed is True
    assert participant.completion_cycle == 1
    assert participant.progress_count == 0
    # Status returns to IN_PROGRESS so the same row can earn again.
    assert participant.status == CampaignParticipant.Status.IN_PROGRESS


def test_second_visit_within_min_gap_is_blocked():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(
        business, required_count=5, minimum_gap=timedelta(minutes=30)
    )

    CampaignProgressService.record_campaign_action(campaign, customer)
    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.record_campaign_action(campaign, customer)

    assert exc.value.code == "CAMPAIGN_MIN_GAP"
    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    # Only the first visit counted.
    assert participant.progress_count == 1


def test_completion_requires_a_reward():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, required_count=1, with_reward=False)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.record_campaign_action(campaign, customer)

    assert exc.value.code == "VALIDATION_ERROR"


def test_priority_resolver_prefers_customer_selection():
    business = make_business()
    customer = make_customer()
    c1 = make_campaign(business)
    c2 = make_campaign(business)

    results = [
        CampaignEligibilityService.evaluate(c1, customer.id),
        CampaignEligibilityService.evaluate(c2, customer.id),
    ]
    chosen = CampaignProgressService.resolve_priority_campaign(
        results, preferred_campaign_id=c2.id
    )

    assert chosen.id == c2.id


def test_priority_resolver_prefers_closest_to_complete():
    business = make_business()
    customer = make_customer()
    c1 = make_campaign(business, required_count=5)
    c2 = make_campaign(business, required_count=5)
    # c2 is closer to completion (4/5 vs 1/5).
    CampaignParticipant.objects.create(
        campaign=c1, customer=customer, progress_count=1,
        status=CampaignParticipant.Status.IN_PROGRESS,
    )
    CampaignParticipant.objects.create(
        campaign=c2, customer=customer, progress_count=4,
        status=CampaignParticipant.Status.IN_PROGRESS,
    )

    results = [
        CampaignEligibilityService.evaluate(
            c1, customer.id,
            CampaignParticipant.objects.get(campaign=c1, customer=customer),
        ),
        CampaignEligibilityService.evaluate(
            c2, customer.id,
            CampaignParticipant.objects.get(campaign=c2, customer=customer),
        ),
    ]
    chosen = CampaignProgressService.resolve_priority_campaign(results)

    assert chosen.id == c2.id


def test_priority_resolver_none_when_no_eligible():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, status=Campaign.Status.PAUSED)

    results = [CampaignEligibilityService.evaluate(campaign, customer.id)]
    chosen = CampaignProgressService.resolve_priority_campaign(results)

    assert chosen is None


def test_visit_counted_notification_scheduled_on_commit(
    django_capture_on_commit_callbacks,
):
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, required_count=2)

    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        CampaignProgressService.record_campaign_action(campaign, customer)

    # The visit notification is scheduled via transaction.on_commit, never inside
    # the atomic block.
    assert len(callbacks) >= 1


def test_join_campaign_is_idempotent():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business)

    first = CampaignProgressService.join_campaign(campaign, customer)
    second = CampaignProgressService.join_campaign(campaign, customer)

    assert first.id == second.id
    assert CampaignParticipant.objects.filter(
        campaign=campaign, customer=customer
    ).count() == 1
