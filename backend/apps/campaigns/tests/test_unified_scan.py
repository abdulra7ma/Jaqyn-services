"""Unified staff scan: one scan advances loyalty + one prioritized campaign (§14).

Covers the baseline-vs-conditional rule: the loyalty leg is always attempted, the
campaign leg is conditional on an eligible joined campaign, and neither leg's
failure aborts the other. Only an invalid token hard-fails.
"""

from datetime import time, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.campaigns.models import CampaignRewardVoucher
from apps.campaigns.services import StaffScannerService
from apps.campaigns.tests.helpers import (
    make_business,
    make_campaign,
    make_customer,
    make_staff,
)
from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption
from apps.qr.models import QRCodeToken
from apps.qr.services import get_or_create_customer_profile_token
from core.exceptions import JaqynAPIException


pytestmark = pytest.mark.django_db


def make_stamp_program(business, required_count=3):
    return RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.STAMP,
        title="Free coffee",
        description="Collect stamps",
        required_count=required_count,
        reward_description="One free drink",
    )


def test_one_scan_advances_both_loyalty_and_campaign():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    make_stamp_program(business, required_count=3)
    campaign = make_campaign(business, required_count=3)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    # Loyalty stamp awarded.
    assert result.loyalty is not None
    assert result.loyalty["state"] == "awarded"
    assert result.loyalty["progress"]["current_count"] == 1
    assert result.loyalty_skipped_reason is None
    # Campaign advanced.
    assert len(result.campaigns) == 1
    assert result.campaigns[0].campaign.id == campaign.id
    assert result.campaigns[0].progress_count == 1
    assert result.skipped_campaigns == []


def test_loyalty_only_when_no_eligible_campaign():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    make_stamp_program(business, required_count=3)
    # No campaign at this business.
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    assert result.loyalty is not None
    assert result.loyalty["state"] == "awarded"
    assert result.campaigns == []
    assert result.skipped_campaigns == []


def test_campaign_only_when_no_active_loyalty_program():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    make_campaign(business, required_count=3)
    # No loyalty program → loyalty leg is skipped.
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    assert result.loyalty is None
    assert result.loyalty_skipped_reason == "BUSINESS_NOT_ACTIVE"
    assert len(result.campaigns) == 1
    assert result.campaigns[0].progress_count == 1


def test_campaign_completion_in_unified_scan_issues_voucher():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    make_stamp_program(business, required_count=3)
    make_campaign(business, required_count=1)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    assert len(result.campaigns) == 1
    assert result.campaigns[0].completed is True
    assert result.campaigns[0].voucher is not None
    assert CampaignRewardVoucher.objects.filter(
        customer=customer, status=CampaignRewardVoucher.Status.ACTIVE
    ).exists()


def test_time_window_ineligible_campaign_still_awards_loyalty():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    make_stamp_program(business, required_count=3)
    # Campaign whose run window has not started yet → ineligible, but the staff
    # taps it explicitly so the campaign leg attempts and is skipped.
    future = timezone.now() + timedelta(days=1)
    campaign = make_campaign(business, required_count=3, start_at=future)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(
        staff, token.token, campaign_id=campaign.id
    )

    assert result.loyalty is not None
    assert result.loyalty["state"] == "awarded"
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
    make_stamp_program(business, required_count=3)
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
        "loyalty",
        "loyalty_skipped",
        "campaigns",
        "skipped_campaigns",
    }
    assert set(data["customer"].keys()) == {"name", "phone"}
    assert data["loyalty"]["state"] == "awarded"
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
