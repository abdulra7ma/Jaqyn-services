"""Phase-2 behaviours for the unified campaigns restructure.

Covers the individual mechanics (STAMP max_banked cap, SPEND threshold + min),
SOCIAL proof completion + idempotency, the per-type analytics triplets, the
business list type/status filters, the customer feed split, the staff
confirm-social endpoint (auth + permission + happy path), and the N+1 query
bounds on the list / feed / wallet endpoints.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignRewardVoucher,
)
from apps.campaigns.services import (
    CampaignAnalyticsService,
    CampaignProgressService,
    StaffScannerService,
)
from apps.campaigns.tests.helpers import (
    make_business,
    make_campaign,
    make_customer,
    make_staff,
)
from apps.qr.services import get_or_create_customer_profile_token
from core.exceptions import JaqynAPIException


pytestmark = pytest.mark.django_db


def _auth(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


# --- STAMP max_banked --------------------------------------------------------


def test_stamp_max_banked_cap_blocks_extra_voucher():
    """A STAMP completion over max_banked counts the stamp but mints no voucher."""
    business = make_business()
    staff = make_staff(business)
    customer = make_customer()
    # REPEATABLE 1-stamp card capped at 1 banked voucher; no min-gap so we can
    # advance twice in a row.
    campaign = make_campaign(
        business,
        mechanic="stamp",
        required_count=1,
        max_banked=1,
        completion_limit="repeatable",
        minimum_gap=timedelta(0),
    )

    first = CampaignProgressService.record_campaign_action(campaign, customer, staff=staff)
    assert first.completed is True
    assert first.voucher is not None

    # Bank is full (1 ACTIVE voucher) → next stamp counts but mints nothing.
    second = CampaignProgressService.record_campaign_action(campaign, customer, staff=staff)
    assert second.completed is False
    assert second.voucher is None
    assert CampaignRewardVoucher.objects.filter(
        customer=customer, status=CampaignRewardVoucher.Status.ACTIVE
    ).count() == 1


# --- SPEND threshold ---------------------------------------------------------


def test_spend_accumulates_and_completes_at_threshold():
    business = make_business()
    staff = make_staff(business)
    customer = make_customer()
    campaign = make_campaign(
        business, mechanic="spend", required_spend=Decimal("1000"),
        min_spend=Decimal("100"), minimum_gap=timedelta(0),
    )

    r1 = CampaignProgressService.record_campaign_action(
        campaign, customer, staff=staff, amount_spend=Decimal("400")
    )
    assert r1.completed is False
    p = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    assert p.current_spend == Decimal("400")

    r2 = CampaignProgressService.record_campaign_action(
        campaign, customer, staff=staff, amount_spend=Decimal("600")
    )
    assert r2.completed is True
    assert r2.voucher is not None


def test_spend_below_min_is_rejected():
    business = make_business()
    staff = make_staff(business)
    customer = make_customer()
    campaign = make_campaign(
        business, mechanic="spend", required_spend=Decimal("1000"),
        min_spend=Decimal("100"),
    )
    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.record_campaign_action(
            campaign, customer, staff=staff, amount_spend=Decimal("50")
        )
    assert exc.value.code == "VALIDATION_ERROR"


def test_spend_requires_amount():
    business = make_business()
    staff = make_staff(business)
    customer = make_customer()
    campaign = make_campaign(business, mechanic="spend", required_spend=Decimal("1000"))
    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.record_campaign_action(campaign, customer, staff=staff)
    assert exc.value.code == "VALIDATION_ERROR"


# --- SOCIAL proof ------------------------------------------------------------


def _social_campaign(business):
    return make_campaign(
        business,
        campaign_type=Campaign.CampaignType.SOCIAL,
        mechanic=None,
        instagram_handle="@cafe",
    )


def test_social_proof_completes_and_mints_one_voucher():
    business = make_business()
    staff = make_staff(business)
    customer = make_customer()
    campaign = _social_campaign(business)

    result = CampaignProgressService.confirm_social_proof(campaign, customer, staff=staff)

    assert result.completed is True
    assert result.voucher is not None
    assert CampaignRewardVoucher.objects.filter(campaign=campaign, customer=customer).count() == 1


def test_social_proof_is_idempotent_no_duplicate_voucher():
    business = make_business()
    staff = make_staff(business)
    customer = make_customer()
    campaign = _social_campaign(business)

    CampaignProgressService.confirm_social_proof(campaign, customer, staff=staff)
    # A ONCE campaign rejects a second confirm (already completed).
    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.confirm_social_proof(campaign, customer, staff=staff)
    assert exc.value.code == "CAMPAIGN_ALREADY_COMPLETED"
    assert CampaignRewardVoucher.objects.filter(campaign=campaign, customer=customer).count() == 1


def test_social_proof_rejects_non_social_campaign():
    business = make_business()
    staff = make_staff(business)
    customer = make_customer()
    individual = make_campaign(business)
    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.confirm_social_proof(individual, customer, staff=staff)
    assert exc.value.code == "VALIDATION_ERROR"


# --- per-type analytics triplets --------------------------------------------


def test_individual_type_stats():
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=5, minimum_gap=timedelta(0))
    # One participant at 4/5 (close to reward), one completed → a redeemed voucher.
    c1, c2 = make_customer("a"), make_customer("b")
    for _ in range(4):
        CampaignParticipant.objects.update_or_create(
            campaign=campaign, customer=c1,
            defaults={"progress_count": 4, "status": CampaignParticipant.Status.IN_PROGRESS},
        )
    stats = CampaignAnalyticsService.type_stats(campaign)
    assert stats.campaign_type == Campaign.CampaignType.INDIVIDUAL
    assert stats.labels["stat_a"] == "Enrolled"
    assert stats.stat_a == 1  # one enrolled participant
    assert stats.stat_c == 1  # c1 is close to reward (4/5 ≥ 80%)


def test_social_type_stats_reach_is_follower_sum():
    business = make_business()
    campaign = _social_campaign(business)
    c1, c2 = make_customer("a"), make_customer("b")
    CampaignParticipant.objects.create(campaign=campaign, customer=c1, follower_count=1000)
    CampaignParticipant.objects.create(campaign=campaign, customer=c2, follower_count=500)
    stats = CampaignAnalyticsService.type_stats(campaign)
    assert stats.campaign_type == Campaign.CampaignType.SOCIAL
    assert stats.labels["stat_c"] == "Reach"
    assert stats.stat_a == 2  # joined
    assert stats.stat_c == 1500  # reach = sum(follower_count)


def test_group_type_stats():
    from apps.campaigns.models import Group, GroupMember

    business = make_business()
    campaign = make_campaign(
        business, campaign_type=Campaign.CampaignType.GROUP, mechanic=None,
        required_group_size=3,
    )
    leader = make_customer("L")
    group = Group.objects.create(
        campaign=campaign, group_leader=leader, required_size=3, invite_token="tok-g",
    )
    GroupMember.objects.create(group=group, customer=leader)
    GroupMember.objects.create(group=group, customer=make_customer("m"))
    stats = CampaignAnalyticsService.type_stats(campaign)
    assert stats.campaign_type == Campaign.CampaignType.GROUP
    assert stats.stat_a == 1  # groups created
    assert stats.stat_b == 2  # customers joined (members)


# --- business list filters ---------------------------------------------------


def _owner_client(business):
    return _auth(business.owner)


def test_business_list_filters_by_type_and_status():
    business = make_business()
    make_campaign(business, campaign_type=Campaign.CampaignType.INDIVIDUAL, status=Campaign.Status.ACTIVE)
    make_campaign(business, campaign_type=Campaign.CampaignType.SOCIAL, mechanic=None, status=Campaign.Status.DRAFT)
    make_campaign(business, campaign_type=Campaign.CampaignType.GROUP, mechanic=None,
                  required_group_size=3, status=Campaign.Status.ENDED)
    client = _owner_client(business)

    by_type = client.get("/api/business/campaigns/?type=social")
    assert by_type.status_code == 200
    assert by_type.data["data"]["count"] == 1
    assert by_type.data["data"]["results"][0]["campaign_type"] == "social"

    by_status = client.get("/api/business/campaigns/?status=draft")
    assert by_status.data["data"]["count"] == 1

    completed = client.get("/api/business/campaigns/?status=completed")
    assert completed.data["data"]["count"] == 1

    # type_stats present on each card.
    assert "type_stats" in by_type.data["data"]["results"][0]


def test_business_list_query_count_bounded(django_assert_num_queries):
    business = make_business()
    for i in range(5):
        make_campaign(business, status=Campaign.Status.ACTIVE)
    client = _owner_client(business)
    # The count must not grow with the number of campaigns (N+1 invariant).
    with django_assert_num_queries(5):
        resp = client.get("/api/business/campaigns/")
    assert resp.status_code == 200
    assert resp.data["data"]["count"] == 5


# --- customer feed -----------------------------------------------------------


def test_customer_feed_splits_followed_and_discover():
    business = make_business()
    customer = make_customer()
    followed = make_campaign(business, required_count=5, minimum_gap=timedelta(0))
    CampaignParticipant.objects.create(
        campaign=followed, customer=customer, status=CampaignParticipant.Status.IN_PROGRESS,
        progress_count=2,
    )
    make_campaign(business, required_count=3)  # discover-only

    client = _auth(customer)
    resp = client.get("/api/customer/campaigns/feed/")

    assert resp.status_code == 200
    data = resp.data["data"]
    followed_ids = {c["id"] for c in data["followed"]}
    discover_ids = {c["id"] for c in data["discover"]}
    assert str(followed.id) in followed_ids
    # No campaign appears in both lists.
    assert followed_ids.isdisjoint(discover_ids)


def test_customer_feed_group_filter():
    business = make_business()
    customer = make_customer()
    make_campaign(business, required_count=3)
    group = make_campaign(
        business, campaign_type=Campaign.CampaignType.GROUP, mechanic=None,
        required_group_size=3,
    )
    client = _auth(customer)
    resp = client.get("/api/customer/campaigns/feed/?discover=group")
    discover_types = {c["campaign_type"] for c in resp.data["data"]["discover"]}
    assert discover_types == {"group"}
    assert str(group.id) in {c["id"] for c in resp.data["data"]["discover"]}


def test_customer_feed_query_count_bounded(django_assert_num_queries):
    business = make_business()
    customer = make_customer()
    for i in range(4):
        make_campaign(business, required_count=3)
    client = _auth(customer)
    with django_assert_num_queries(5):
        resp = client.get("/api/customer/campaigns/feed/")
    assert resp.status_code == 200


def test_customer_wallet_query_count_bounded(django_assert_num_queries):
    business = make_business()
    staff = make_staff(business)
    customer = make_customer()
    # Mint a few vouchers by completing a 1-visit repeatable campaign.
    campaign = make_campaign(
        business, required_count=1, completion_limit="repeatable", minimum_gap=timedelta(0),
    )
    for _ in range(3):
        CampaignProgressService.record_campaign_action(campaign, customer, staff=staff)
    client = _auth(customer)
    with django_assert_num_queries(3):
        resp = client.get("/api/customer/campaign-wallet/")
    assert resp.status_code == 200
    assert resp.data["data"]["count"] >= 1


# --- staff confirm-social endpoint ------------------------------------------


def test_confirm_social_endpoint_happy_path():
    business = make_business()
    staff = make_staff(business)
    customer = make_customer()
    campaign = _social_campaign(business)
    token = get_or_create_customer_profile_token(customer)

    client = _auth(staff.user)
    resp = client.post(
        "/api/staff/campaigns/confirm-social/",
        {"token": token.token, "campaign_id": str(campaign.id)},
        format="json",
    )

    assert resp.status_code == 200, resp.content
    assert resp.data["data"]["completed"] is True
    assert resp.data["data"]["voucher"] is not None
    assert CampaignRewardVoucher.objects.filter(campaign=campaign, customer=customer).exists()


def test_confirm_social_endpoint_requires_auth():
    resp = APIClient().post(
        "/api/staff/campaigns/confirm-social/",
        {"token": "x", "campaign_id": "00000000-0000-0000-0000-000000000000"},
        format="json",
    )
    assert resp.status_code in (401, 403)


def test_confirm_social_endpoint_forbidden_for_customer():
    business = make_business()
    customer = make_customer()
    campaign = _social_campaign(business)
    token = get_or_create_customer_profile_token(customer)
    client = _auth(customer)
    resp = client.post(
        "/api/staff/campaigns/confirm-social/",
        {"token": token.token, "campaign_id": str(campaign.id)},
        format="json",
    )
    assert resp.status_code == 403
