"""Staff scanner invariants (plan §1.2 / D2 / D3)."""

from decimal import Decimal

import pytest

from apps.campaigns.models import CampaignRewardVoucher, CampaignRule
from apps.campaigns.services import StaffScannerService, CampaignRewardService
from apps.campaigns.services.progress import CampaignProgressService
from apps.qr.models import QRCodeToken, ScanLog
from apps.qr.services import get_or_create_customer_profile_token
from apps.campaigns.tests.helpers import (
    make_business,
    make_campaign,
    make_customer,
    make_staff,
)
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


@pytest.mark.skip(reason="Points scan rows moved to apps.loyalty")
def test_scan_customer_qr_includes_points_program_fields():
    """A POINTS program is surfaced eligible with its mechanic + accrual fields."""
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(
        business,
        mechanic=CampaignRule.Mechanic.POINTS,
        points_basis=CampaignRule.PointsBasis.SPEND,
        points_per_som=Decimal("0.10"),
        cashback_per_point=Decimal("0.50"),
    )
    # Give the customer an existing balance so the row reports it.
    CampaignProgressService.record_campaign_action(
        campaign, customer, amount_spend=Decimal("100")
    )
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.scan_customer_qr(staff, token.token)

    view = next(v for v in result.campaigns if v.campaign.id == campaign.id)
    assert view.eligible is True
    assert view.mechanic == CampaignRule.Mechanic.POINTS
    assert view.campaign_type == campaign.campaign_type
    assert view.reward_title is not None
    assert view.points_balance == 10  # floor(0.10 * 100)
    assert view.points_per_som == Decimal("0.10")
    assert view.cashback_per_point == Decimal("0.50")
    assert view.points_per_visit is None


def test_scan_non_customer_token_rejected():
    business = make_business()
    staff = make_staff(business)
    # A merchant-collect token is not a customer profile token.
    bad = QRCodeToken.objects.create(
        token="not-a-customer",
        type=QRCodeToken.Type.MERCHANT_COLLECT,
        business=business,
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


def test_resolve_scan_customer_token_returns_customer_kind():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    make_campaign(business, required_count=3)
    token = get_or_create_customer_profile_token(customer)

    dispatch = StaffScannerService.resolve_scan(staff, token.token)

    assert dispatch.kind == "customer"
    assert dispatch.customer_result is not None
    assert dispatch.customer_result.customer.id == customer.id
    assert dispatch.voucher is None


def test_resolve_scan_voucher_token_returns_voucher_kind():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    # Complete the campaign to mint an ACTIVE voucher with a QR token.
    result = StaffScannerService.confirm_visit(staff, campaign.id, customer)
    voucher = result.voucher
    assert voucher is not None and voucher.qr_token is not None

    dispatch = StaffScannerService.resolve_scan(staff, voucher.qr_token.token)

    assert dispatch.kind == "voucher"
    assert dispatch.voucher is not None
    assert dispatch.voucher.id == voucher.id


def test_resolve_scan_redeemed_voucher_returns_invalid_kind():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    voucher = StaffScannerService.confirm_visit(staff, campaign.id, customer).voucher
    CampaignRewardService.redeem_reward_voucher(staff, token=voucher.qr_token.token)

    dispatch = StaffScannerService.resolve_scan(staff, voucher.qr_token.token)

    assert dispatch.kind == "invalid"
    assert dispatch.reason_code == "VOUCHER_ALREADY_REDEEMED"
