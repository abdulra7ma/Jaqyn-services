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
    assert result.campaign is not None
    assert result.campaign.campaign.id == campaign.id
    assert result.campaign.progress_count == 1
    assert result.campaign_skipped_reason is None


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
    assert result.campaign is None
    assert result.campaign_skipped_reason is None


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
    assert result.campaign is not None
    assert result.campaign.progress_count == 1


def test_campaign_completion_in_unified_scan_issues_voucher():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    make_stamp_program(business, required_count=3)
    make_campaign(business, required_count=1)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    assert result.campaign is not None
    assert result.campaign.completed is True
    assert result.campaign.voucher is not None
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
    assert result.campaign is None
    assert result.campaign_skipped_reason is not None


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
        "campaign",
        "campaign_skipped",
    }
    assert set(data["customer"].keys()) == {"name", "phone"}
    assert data["loyalty"]["state"] == "awarded"
    assert data["campaign"]["progress_count"] == 1


def test_unified_visit_endpoint_requires_auth():
    resp = APIClient().post(
        "/api/staff/campaigns/visit/", {"token": "x"}, format="json"
    )
    assert resp.status_code in (401, 403)
