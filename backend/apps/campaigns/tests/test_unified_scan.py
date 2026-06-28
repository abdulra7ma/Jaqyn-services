"""Unified staff scan: one scan advances every eligible campaign (§14).

Post-restructure there is no separate loyalty leg — a loyalty card is an
INDIVIDUAL (STAMP) campaign, so one scan advances all eligible campaigns: every
stacking campaign plus the single prioritized default. Only an invalid token
hard-fails.
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.campaigns.models import (
    CampaignParticipant,
    CampaignRewardVoucher,
    CampaignRule,
)
from apps.campaigns.services import StaffScannerService
from apps.campaigns.tests.helpers import (
    make_business,
    make_campaign,
    make_customer,
    make_staff,
)
from apps.qr.models import QRCodeToken
from apps.qr.services import get_or_create_customer_profile_token
from core.exceptions import JaqynAPIException


pytestmark = pytest.mark.django_db


def test_one_scan_advances_the_default_campaign():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=3)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    assert len(result.campaigns) == 1
    assert result.campaigns[0].campaign.id == campaign.id
    assert result.campaigns[0].progress_count == 1
    assert result.skipped_campaigns == []


def test_no_campaign_advances_when_none_exist():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    assert result.campaigns == []
    assert result.skipped_campaigns == []


def test_campaign_completion_in_unified_scan_issues_voucher():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    make_campaign(business, required_count=1)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    assert len(result.campaigns) == 1
    assert result.campaigns[0].completed is True
    assert result.campaigns[0].voucher is not None
    assert CampaignRewardVoucher.objects.filter(
        customer=customer, status=CampaignRewardVoucher.Status.ACTIVE
    ).exists()


def test_ineligible_tapped_campaign_is_skipped():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    # Campaign whose run window has not started yet → ineligible, but the staff
    # taps it explicitly so the campaign leg attempts and is skipped.
    future = timezone.now() + timedelta(days=1)
    campaign = make_campaign(business, required_count=3, start_at=future)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(
        staff, token.token, campaign_id=campaign.id
    )

    assert result.campaigns == []
    assert len(result.skipped_campaigns) == 1


def test_invalid_token_hard_fails():
    business = make_business()
    staff = make_staff(business)
    bad = QRCodeToken.objects.create(
        token="not-a-customer-unified",
        type=QRCodeToken.Type.MERCHANT_COLLECT,
        business=business,
    )

    with pytest.raises(JaqynAPIException) as exc:
        StaffScannerService.confirm_visit_unified(staff, bad.token)

    assert exc.value.code == "INVALID_QR_TOKEN"


def _auth_client(staff):
    user = staff.user
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


def test_unified_visit_endpoint_returns_shape():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    make_campaign(business, required_count=3)
    token = get_or_create_customer_profile_token(customer)

    client = _auth_client(staff)
    resp = client.post(
        "/api/staff/campaigns/visit/", {"token": token.token}, format="json"
    )

    assert resp.status_code == 200, resp.content
    data = resp.json()["data"]
    assert set(data.keys()) == {
        "customer",
        "campaigns",
        "skipped_campaigns",
    }
    assert set(data["customer"].keys()) == {"name", "phone"}
    assert isinstance(data["campaigns"], list)
    assert len(data["campaigns"]) == 1
    assert data["campaigns"][0]["progress_count"] == 1
    assert data["skipped_campaigns"] == []


def test_unified_visit_endpoint_requires_auth():
    resp = APIClient().post(
        "/api/staff/campaigns/visit/", {"token": "x"}, format="json"
    )
    assert resp.status_code in (401, 403)


def test_stacking_campaigns_all_advance_in_one_scan():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    # Two opt-in (stacking) campaigns + one default campaign.
    c1 = make_campaign(business, required_count=3, allow_multiple=True)
    c2 = make_campaign(business, required_count=3, allow_multiple=True)
    c3 = make_campaign(business, required_count=3, allow_multiple=False)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    advanced_ids = {pr.campaign.id for pr in result.campaigns}
    # Both stacking campaigns advance; exactly one default campaign advances.
    assert c1.id in advanced_ids
    assert c2.id in advanced_ids
    assert c3.id in advanced_ids  # the only default → it is the chosen one
    assert len(result.campaigns) == 3
    assert result.skipped_campaigns == []


def test_only_one_default_campaign_advances():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    # Two default (non-stacking) campaigns → only one may count this visit.
    make_campaign(business, required_count=3, allow_multiple=False)
    make_campaign(business, required_count=3, allow_multiple=False)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    assert len(result.campaigns) == 1


def test_min_gap_on_one_campaign_does_not_block_others():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    # Two stacking campaigns; pre-advance c_blocked so its min-gap blocks a
    # second visit within the default window, while c_open still advances.
    c_blocked = make_campaign(business, required_count=5, allow_multiple=True)
    c_open = make_campaign(business, required_count=5, allow_multiple=True)
    StaffScannerService.confirm_visit(staff, c_blocked.id, customer)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    advanced_ids = {pr.campaign.id for pr in result.campaigns}
    skipped_ids = {sc.campaign_id for sc in result.skipped_campaigns}
    assert c_open.id in advanced_ids
    assert c_blocked.id in skipped_ids


# --- choose-one confirm with a bill amount (redesigned staff loyalty scan) ----


@pytest.mark.skip(reason="Points awards moved to apps.loyalty")
def test_confirm_points_spend_basis_awards_by_rate_and_returns_balance():
    """POST /visit/ with campaign_id + amount on a POINTS spend-basis program
    awards floor(points_per_som × amount) and returns the new points_balance."""
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.POINTS,
        points_basis=CampaignRule.PointsBasis.SPEND,
        points_per_som=Decimal("0.10"),  # 1 point per 10 som
        cashback_per_point=Decimal("0.50"),
    )
    token = get_or_create_customer_profile_token(customer)

    client = _auth_client(staff)
    resp = client.post(
        "/api/staff/campaigns/visit/",
        {"token": token.token, "campaign_id": str(campaign.id), "amount": "250"},
        format="json",
    )

    assert resp.status_code == 200, resp.content
    rows = resp.json()["data"]["campaigns"]
    assert len(rows) == 1
    row = rows[0]
    assert row["campaign"]["id"] == str(campaign.id)
    assert row["points_balance"] == 25  # floor(0.10 * 250)
    assert row["completed"] is False
    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    assert participant.points_balance == 25


@pytest.mark.skip(reason="Stamp awards moved to apps.loyalty")
def test_confirm_stamp_with_campaign_id_no_amount_increments_by_one():
    """A STAMP program targeted by campaign_id with no amount still counts one."""
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(
        business, mechanic=CampaignRule.Mechanic.STAMP, required_count=5
    )
    token = get_or_create_customer_profile_token(customer)

    client = _auth_client(staff)
    resp = client.post(
        "/api/staff/campaigns/visit/",
        {"token": token.token, "campaign_id": str(campaign.id)},
        format="json",
    )

    assert resp.status_code == 200, resp.content
    rows = resp.json()["data"]["campaigns"]
    assert len(rows) == 1
    assert rows[0]["progress_count"] == 1
    assert rows[0]["completed"] is False


@pytest.mark.skip(reason="Spend awards moved to apps.loyalty")
def test_confirm_spend_requires_amount_then_accumulates():
    """A SPEND program targeted by campaign_id rejects a missing amount (400) and
    accumulates current_spend when the amount is provided."""
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.SPEND,
        required_spend=Decimal("1000"),
        min_spend=Decimal("0"),
    )
    token = get_or_create_customer_profile_token(customer)
    client = _auth_client(staff)

    # Missing amount → 400 (service-enforced business rule).
    missing = client.post(
        "/api/staff/campaigns/visit/",
        {"token": token.token, "campaign_id": str(campaign.id)},
        format="json",
    )
    assert missing.status_code == 400, missing.content

    # With amount → accumulates onto current_spend.
    ok = client.post(
        "/api/staff/campaigns/visit/",
        {"token": token.token, "campaign_id": str(campaign.id), "amount": "300"},
        format="json",
    )
    assert ok.status_code == 200, ok.content
    rows = ok.json()["data"]["campaigns"]
    assert len(rows) == 1
    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    assert participant.current_spend == Decimal("300")


@pytest.mark.skip(reason="Points awards moved to apps.loyalty")
def test_confirm_points_visit_basis_no_amount_awards_per_visit():
    """A POINTS visit-basis program targeted by campaign_id with no amount awards
    the rule's points_per_visit."""
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.POINTS,
        points_basis=CampaignRule.PointsBasis.VISIT,
        points_per_visit=10,
        cashback_per_point=Decimal("0.50"),
    )
    token = get_or_create_customer_profile_token(customer)

    client = _auth_client(staff)
    resp = client.post(
        "/api/staff/campaigns/visit/",
        {"token": token.token, "campaign_id": str(campaign.id)},
        format="json",
    )

    assert resp.status_code == 200, resp.content
    rows = resp.json()["data"]["campaigns"]
    assert len(rows) == 1
    assert rows[0]["points_balance"] == 10
    assert rows[0]["completed"] is False
