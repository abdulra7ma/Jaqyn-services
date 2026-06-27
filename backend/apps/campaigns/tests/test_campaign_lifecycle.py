"""Campaign lifecycle and publish-rule invariants (plan §1.2 / §23)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.campaigns.models import Campaign
from apps.campaigns.services import CampaignService
from apps.campaigns.tests.helpers import make_business, make_campaign
from core.exceptions import JaqynAPIException


pytestmark = pytest.mark.django_db


def test_create_campaign_starts_as_draft():
    business = make_business()

    campaign = CampaignService.create_campaign(
        business,
        business.owner,
        {"name": "New", "campaign_type": Campaign.CampaignType.INDIVIDUAL, "status": "active"},
    )

    # status in data is ignored — always DRAFT.
    assert campaign.status == Campaign.Status.DRAFT


def test_publish_requires_reward_and_rule():
    business = make_business()
    # Draft campaign with no rule/reward.
    campaign = make_campaign(
        business, status=Campaign.Status.DRAFT, with_reward=False
    )
    campaign.rule.delete()
    campaign = Campaign.objects.get(id=campaign.id)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignService.publish_campaign(campaign, business)

    assert exc.value.code == "CAMPAIGN_NOT_PUBLISHABLE"


def test_publish_now_goes_active():
    business = make_business()
    campaign = make_campaign(business, status=Campaign.Status.DRAFT)

    published = CampaignService.publish_campaign(campaign, business)

    assert published.status == Campaign.Status.ACTIVE


def test_publish_future_start_goes_scheduled():
    business = make_business()
    campaign = make_campaign(
        business,
        status=Campaign.Status.DRAFT,
        start_at=timezone.now() + timedelta(days=1),
    )

    published = CampaignService.publish_campaign(campaign, business)

    assert published.status == Campaign.Status.SCHEDULED


def test_publish_rejects_end_before_start():
    business = make_business()
    now = timezone.now()
    campaign = make_campaign(
        business,
        status=Campaign.Status.DRAFT,
        start_at=now + timedelta(days=2),
        end_at=now + timedelta(days=1),
    )

    with pytest.raises(JaqynAPIException) as exc:
        CampaignService.publish_campaign(campaign, business)

    assert exc.value.code == "CAMPAIGN_NOT_PUBLISHABLE"


def test_publish_other_business_rejected():
    business = make_business("401")
    other = make_business("402")
    campaign = make_campaign(business, status=Campaign.Status.DRAFT)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignService.publish_campaign(campaign, other)

    assert exc.value.code == "PERMISSION_DENIED"


def test_pause_resume_cycle():
    business = make_business()
    campaign = make_campaign(business, status=Campaign.Status.ACTIVE)

    CampaignService.pause(campaign, business)
    assert Campaign.objects.get(id=campaign.id).status == Campaign.Status.PAUSED

    CampaignService.resume(campaign, business)
    assert Campaign.objects.get(id=campaign.id).status == Campaign.Status.ACTIVE


def test_cannot_pause_non_active():
    business = make_business()
    campaign = make_campaign(business, status=Campaign.Status.DRAFT)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignService.pause(campaign, business)

    assert exc.value.code == "CAMPAIGN_INVALID_STATE"


def test_update_blocked_once_active():
    business = make_business()
    campaign = make_campaign(business, status=Campaign.Status.ACTIVE)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignService.update_campaign(campaign, business, {"name": "Renamed"})

    assert exc.value.code == "CAMPAIGN_INVALID_STATE"


def test_lifecycle_transition_activates_and_ends():
    business = make_business()
    now = timezone.now()
    # Scheduled campaign whose start has passed → should activate.
    to_activate = make_campaign(
        business, status=Campaign.Status.SCHEDULED, start_at=now - timedelta(hours=1)
    )
    # Active campaign whose end has passed → should end.
    to_end = make_campaign(
        business, status=Campaign.Status.ACTIVE, end_at=now - timedelta(hours=1)
    )

    counts = CampaignService.run_lifecycle_transitions(now)

    assert counts["activated"] == 1
    assert counts["ended"] == 1
    assert Campaign.objects.get(id=to_activate.id).status == Campaign.Status.ACTIVE
    assert Campaign.objects.get(id=to_end.id).status == Campaign.Status.ENDED
