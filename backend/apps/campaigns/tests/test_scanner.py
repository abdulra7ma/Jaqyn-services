"""Staff scanner invariants (plan §1.2 / D2 / D3)."""

import pytest

from apps.campaigns.models import CampaignRewardVoucher
from apps.campaigns.services import StaffScannerService
from apps.qr.models import QRCodeToken, ScanLog
from apps.qr.services import get_or_create_customer_profile_token
from apps.campaigns.tests.helpers import make_business, make_campaign, make_customer, make_staff
from core.exceptions import JaqynAPIException


pytestmark = pytest.mark.django_db


def test_scan_customer_qr_lists_eligible_campaigns():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=3)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.scan_customer_qr(staff, token.token)

    assert result.customer.id == customer.id
    assert len(result.campaigns) == 1
    view = result.campaigns[0]
    assert view.campaign.id == campaign.id
    assert view.eligible is True
    assert view.required_count == 3
    assert view.progress_count == 0


def test_scan_non_customer_token_rejected():
    business = make_business()
    staff = make_staff(business)
    # A merchant-collect token is not a customer profile token.
    bad = QRCodeToken.objects.create(
        token="not-a-customer", type=QRCodeToken.Type.MERCHANT_COLLECT, business=business
    )

    with pytest.raises(JaqynAPIException) as exc:
        StaffScannerService.scan_customer_qr(staff, bad.token)

    assert exc.value.code == "INVALID_QR_TOKEN"


def test_confirm_visit_counts_and_logs():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=2)

    result = StaffScannerService.confirm_visit(staff, campaign.id, customer)

    assert result.progress_count == 1
    assert result.completed is False
    assert ScanLog.objects.filter(
        action="campaign_confirm_visit", status=ScanLog.Status.SUCCESS
    ).exists()


def test_confirm_visit_wrong_business_rejected():
    business = make_business("301")
    other = make_business("302")
    customer = make_customer()
    staff = make_staff(other, suffix="302")
    campaign = make_campaign(business, required_count=2)

    with pytest.raises(JaqynAPIException) as exc:
        StaffScannerService.confirm_visit(staff, campaign.id, customer)

    assert exc.value.code == "WRONG_BUSINESS"


def test_scan_reward_qr_validates_voucher():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    result = StaffScannerService.confirm_visit(staff, campaign.id, customer)
    voucher = result.voucher

    validated = StaffScannerService.scan_reward_qr(staff, token=voucher.qr_token.token)

    assert validated.id == voucher.id
    assert validated.status == CampaignRewardVoucher.Status.ACTIVE


def test_confirm_group_visit_unknown_session_raises_not_found():
    """The scanner confirm-group seam now resolves the real group flow.

    An unknown group session id raises ``GROUP_SESSION_NOT_FOUND`` (a clean typed
    error), not the old ``VALIDATION_ERROR`` Phase-2 stub. The full success path is
    exercised in ``test_group_flow.py``.
    """
    business = make_business()
    staff = make_staff(business)

    with pytest.raises(JaqynAPIException) as exc:
        StaffScannerService.confirm_group_visit(
            staff, "00000000-0000-0000-0000-000000000000"
        )

    assert exc.value.code == "GROUP_SESSION_NOT_FOUND"
