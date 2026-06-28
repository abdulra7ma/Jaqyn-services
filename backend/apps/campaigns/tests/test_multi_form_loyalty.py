"""Tests for multi-form loyalty: POINTS → cashback + item rewards (slice 1).

Covers the new service behavior (points accrual on both bases, redeem-points,
item-reward fixed vs customer-choice selection, the business loyalty list and its
query count) and the new customer endpoints (auth + permission + happy path).
The base campaign mechanics are exercised by the sibling suites; these tests prove
only the multi-form additions and that the suite stays green.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.campaigns.models import (
    CampaignParticipant,
    CampaignReward,
    CampaignRewardVoucher,
    CampaignRule,
)
from apps.campaigns.services import (
    CampaignProgressService,
    CampaignRewardService,
    CampaignService,
)
from apps.campaigns.tests.helpers import (
    make_business,
    make_campaign,
    make_catalog_item,
    make_customer,
)
from core.exceptions import JaqynAPIException

pytestmark = pytest.mark.django_db


def auth(user) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    access = refresh.access_token  # type: ignore[attr-defined]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


# --- points accrual ---------------------------------------------------------


def test_points_accrual_visit_basis():
    business = make_business("p01")
    customer = make_customer("p01")
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.POINTS,
        points_basis=CampaignRule.PointsBasis.VISIT,
        points_per_visit=10,
        cashback_per_point=Decimal("0.50"),
        minimum_gap=timedelta(0),
    )

    r1 = CampaignProgressService.record_campaign_action(campaign, customer)
    assert r1.completed is False
    assert r1.progress_count == 10
    assert r1.required_count == 0

    CampaignProgressService.record_campaign_action(campaign, customer)
    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    # Two visits accrue, nothing completes, status stays IN_PROGRESS.
    assert participant.points_balance == 20
    assert participant.status == CampaignParticipant.Status.IN_PROGRESS
    assert CampaignRewardVoucher.objects.filter(campaign=campaign).count() == 0


def test_points_accrual_spend_basis():
    business = make_business("p02")
    customer = make_customer("p02")
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.POINTS,
        points_basis=CampaignRule.PointsBasis.SPEND,
        points_per_som=Decimal("0.10"),  # 1 point per 10 som
        cashback_per_point=Decimal("1.00"),
    )

    # 250 som × 0.10 = 25 points.
    r = CampaignProgressService.record_campaign_action(
        campaign, customer, amount_spend=Decimal("250.00")
    )
    assert r.completed is False
    assert r.progress_count == 25
    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    assert participant.points_balance == 25


def test_points_spend_basis_requires_amount():
    business = make_business("p03")
    customer = make_customer("p03")
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.POINTS,
        points_basis=CampaignRule.PointsBasis.SPEND,
        points_per_som=Decimal("0.10"),
        cashback_per_point=Decimal("1.00"),
    )
    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.record_campaign_action(campaign, customer)
    assert exc.value.code == "VALIDATION_ERROR"


# --- redeem points ----------------------------------------------------------


def _points_campaign(suffix: str):
    business = make_business(suffix)
    customer = make_customer(suffix)
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.POINTS,
        points_basis=CampaignRule.PointsBasis.VISIT,
        points_per_visit=10,
        cashback_per_point=Decimal("0.50"),
        reward_type=CampaignReward.RewardType.CASHBACK,
        minimum_gap=timedelta(0),
    )
    return business, customer, campaign


def test_redeem_points_success_mints_cashback_voucher():
    _, customer, campaign = _points_campaign("r01")
    for _ in range(3):
        CampaignProgressService.record_campaign_action(campaign, customer)  # 30 pts

    voucher = CampaignRewardService.redeem_points(campaign, customer, 20)
    assert voucher.cashback_amount == Decimal("10.00")  # 20 × 0.50
    assert voucher.reward.reward_type == CampaignReward.RewardType.CASHBACK
    assert voucher.status == CampaignRewardVoucher.Status.ACTIVE
    assert voucher.qr_token is not None

    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    assert participant.points_balance == 10  # 30 − 20


def test_redeem_points_insufficient_balance_raises():
    _, customer, campaign = _points_campaign("r02")
    CampaignProgressService.record_campaign_action(campaign, customer)  # 10 pts
    with pytest.raises(JaqynAPIException) as exc:
        CampaignRewardService.redeem_points(campaign, customer, 50)
    assert exc.value.code == "INSUFFICIENT_POINTS"
    # No voucher minted, balance untouched.
    assert CampaignRewardVoucher.objects.filter(campaign=campaign).count() == 0
    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    assert participant.points_balance == 10


def test_redeem_points_rejects_non_points_campaign():
    business = make_business("r03")
    customer = make_customer("r03")
    campaign = make_campaign(business, mechanic=CampaignRule.Mechanic.VISIT)
    with pytest.raises(JaqynAPIException) as exc:
        CampaignRewardService.redeem_points(campaign, customer, 5)
    assert exc.value.code == "CAMPAIGN_NOT_POINTS"


# --- item reward: fixed vs customer-choice ----------------------------------


def test_item_reward_fixed_sets_voucher_catalog_item():
    business = make_business("i01")
    customer = make_customer("i01")
    item = make_catalog_item(business, name="Croissant")
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.VISIT,
        required_count=1,
        reward_type=CampaignReward.RewardType.FREE_ITEM,
        item_selection=CampaignReward.ItemSelection.FIXED,
        catalog_item=item,
    )
    result = CampaignProgressService.record_campaign_action(campaign, customer)
    assert result.completed is True
    assert result.voucher is not None
    assert result.voucher.catalog_item_id == item.id


def test_item_reward_customer_choice_leaves_null_then_select():
    business = make_business("i02")
    customer = make_customer("i02")
    item = make_catalog_item(business, name="Mocha")
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.VISIT,
        required_count=1,
        reward_type=CampaignReward.RewardType.FREE_ITEM,
        item_selection=CampaignReward.ItemSelection.CUSTOMER,
    )
    result = CampaignProgressService.record_campaign_action(campaign, customer)
    voucher = result.voucher
    assert voucher is not None
    assert voucher.catalog_item_id is None

    updated = CampaignRewardService.select_voucher_item(voucher.id, customer, item.id)
    assert updated.catalog_item_id == item.id


def test_select_voucher_item_rejects_other_business_item():
    business = make_business("i03")
    other = make_business("i04")
    customer = make_customer("i03")
    foreign_item = make_catalog_item(other, name="Foreign")
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.VISIT,
        required_count=1,
        reward_type=CampaignReward.RewardType.FREE_ITEM,
        item_selection=CampaignReward.ItemSelection.CUSTOMER,
    )
    voucher = CampaignProgressService.record_campaign_action(campaign, customer).voucher
    assert voucher is not None
    with pytest.raises(JaqynAPIException) as exc:
        CampaignRewardService.select_voucher_item(voucher.id, customer, foreign_item.id)
    assert exc.value.code == "CATALOG_ITEM_NOT_FOUND"


def test_select_voucher_item_rejects_fixed_reward_voucher():
    business = make_business("i05")
    customer = make_customer("i05")
    item = make_catalog_item(business, name="Preset")
    other_item = make_catalog_item(business, name="Other")
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.VISIT,
        required_count=1,
        reward_type=CampaignReward.RewardType.FREE_ITEM,
        item_selection=CampaignReward.ItemSelection.FIXED,
        catalog_item=item,
    )
    voucher = CampaignProgressService.record_campaign_action(campaign, customer).voucher
    assert voucher is not None
    with pytest.raises(JaqynAPIException) as exc:
        CampaignRewardService.select_voucher_item(voucher.id, customer, other_item.id)
    assert exc.value.code == "VOUCHER_ITEM_NOT_SELECTABLE"


# --- business loyalty list --------------------------------------------------


def test_loyalty_programs_for_customer_reports_state():
    business = make_business("l01")
    customer = make_customer("l01")
    points = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.POINTS,
        points_basis=CampaignRule.PointsBasis.VISIT,
        points_per_visit=10,
        cashback_per_point=Decimal("0.50"),
    )
    visit = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.VISIT,
        required_count=5,
        minimum_gap=timedelta(0),
    )
    # Customer accrues on the points program, joins (auto) the visit one twice.
    CampaignProgressService.record_campaign_action(points, customer)
    CampaignProgressService.record_campaign_action(visit, customer)
    CampaignProgressService.record_campaign_action(visit, customer)

    programs = CampaignService.loyalty_programs_for_customer(business, customer)
    by_id = {p.campaign_id: p for p in programs}
    assert set(by_id) == {str(points.id), str(visit.id)}

    p_points = by_id[str(points.id)]
    assert p_points.mechanic == CampaignRule.Mechanic.POINTS
    assert p_points.points_balance == 10
    assert p_points.target == 0
    assert p_points.joined is True
    assert p_points.cashback_per_point == Decimal("0.50")

    p_visit = by_id[str(visit.id)]
    assert p_visit.mechanic == CampaignRule.Mechanic.VISIT
    assert p_visit.progress_count == 2
    assert p_visit.target == 5
    assert p_visit.cashback_per_point is None


def test_loyalty_programs_query_count(django_assert_num_queries):
    business = make_business("l02")
    customer = make_customer("l02")
    for _ in range(4):
        c = make_campaign(business, mechanic=CampaignRule.Mechanic.VISIT)
        CampaignProgressService.record_campaign_action(c, customer)
    # Fixed regardless of program count: campaigns query + participants query.
    with django_assert_num_queries(2):
        programs = CampaignService.loyalty_programs_for_customer(business, customer)
        # Force evaluation of every row's fields (no per-row query).
        _ = [(p.mechanic, p.points_balance, p.reward_summary) for p in programs]
    assert len(programs) == 4


# --- endpoints: auth + permission + happy path ------------------------------


def test_redeem_points_endpoint_requires_auth():
    business = make_business("e01")
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.POINTS,
        points_basis=CampaignRule.PointsBasis.VISIT,
        points_per_visit=10,
        cashback_per_point=Decimal("0.50"),
        reward_type=CampaignReward.RewardType.CASHBACK,
    )
    resp = APIClient().post(
        f"/api/customer/campaigns/{campaign.id}/redeem-points/",
        {"points": 5},
        format="json",
    )
    assert resp.status_code == 401


def test_redeem_points_endpoint_rejects_business_owner():
    business = make_business("e02")
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.POINTS,
        points_basis=CampaignRule.PointsBasis.VISIT,
        points_per_visit=10,
        cashback_per_point=Decimal("0.50"),
        reward_type=CampaignReward.RewardType.CASHBACK,
    )
    resp = auth(business.owner).post(
        f"/api/customer/campaigns/{campaign.id}/redeem-points/",
        {"points": 5},
        format="json",
    )
    assert resp.status_code == 403


def test_redeem_points_endpoint_happy_path():
    _, customer, campaign = _points_campaign("e03")
    for _ in range(2):
        CampaignProgressService.record_campaign_action(campaign, customer)  # 20 pts
    resp = auth(customer).post(
        f"/api/customer/campaigns/{campaign.id}/redeem-points/",
        {"points": 20},
        format="json",
    )
    assert resp.status_code == 201
    data = resp.data["data"]
    assert data["cashback_amount"] == "10.00"
    assert data["reward_type"] == CampaignReward.RewardType.CASHBACK


def test_business_loyalty_endpoint_happy_path():
    business = make_business("e04")
    customer = make_customer("e04")
    campaign = make_campaign(business, mechanic=CampaignRule.Mechanic.VISIT, required_count=5)
    CampaignProgressService.record_campaign_action(campaign, customer)
    resp = auth(customer).get(f"/api/customer/businesses/{business.id}/loyalty/")
    assert resp.status_code == 200
    results = resp.data["data"]["results"]
    assert len(results) == 1
    assert results[0]["campaign_id"] == str(campaign.id)
    assert results[0]["progress_count"] == 1
    assert results[0]["target"] == 5


def test_select_item_endpoint_happy_path():
    business = make_business("e05")
    customer = make_customer("e05")
    item = make_catalog_item(business, name="Pick me")
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.VISIT,
        required_count=1,
        reward_type=CampaignReward.RewardType.FREE_ITEM,
        item_selection=CampaignReward.ItemSelection.CUSTOMER,
    )
    voucher = CampaignProgressService.record_campaign_action(campaign, customer).voucher
    resp = auth(customer).post(
        f"/api/customer/campaign-vouchers/{voucher.id}/select-item/",
        {"catalog_item_id": str(item.id)},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["data"]["catalog_item"]["id"] == str(item.id)


def test_campaign_catalog_endpoint_happy_path():
    business = make_business("e06")
    customer = make_customer("e06")
    make_catalog_item(business, name="One")
    make_catalog_item(business, name="Two")
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.VISIT,
        required_count=1,
        reward_type=CampaignReward.RewardType.FREE_ITEM,
        item_selection=CampaignReward.ItemSelection.CUSTOMER,
    )
    resp = auth(customer).get(f"/api/customer/campaigns/{campaign.id}/catalog/")
    assert resp.status_code == 200
    assert resp.data["data"]["count"] == 2
