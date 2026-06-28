"""Voucher issuance, redemption, expiry, and cancellation invariants (§19)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.campaigns.models import (
    CampaignParticipant,
    CampaignRewardVoucher,
)
from apps.campaigns.services import (
    CampaignProgressService,
    CampaignRewardService,
)
from apps.qr.models import ScanLog
from apps.reporting.models import AdminAuditLog
from apps.staff.models import StaffMember
from apps.campaigns.tests.helpers import (
    make_business,
    make_campaign,
    make_customer,
    make_staff,
)
from core.exceptions import JaqynAPIException


pytestmark = pytest.mark.django_db


def _issued_voucher(business, customer, campaign):
    """Run the completion path to mint a real ACTIVE voucher with a QR token."""
    result = CampaignProgressService.record_campaign_action(campaign, customer)
    return result.voucher


def test_valid_voucher_redeems_once():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    voucher = _issued_voucher(business, customer, campaign)

    redeemed = CampaignRewardService.redeem_reward_voucher(
        staff, code=voucher.voucher_code
    )

    assert redeemed.status == CampaignRewardVoucher.Status.REDEEMED
    assert redeemed.redeemed_by_staff_id == staff.id
    assert redeemed.redeemed_at is not None
    # Owning participant flips to REDEEMED.
    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    assert participant.status == CampaignParticipant.Status.REDEEMED
    assert ScanLog.objects.filter(
        action="campaign_redeem_voucher", status=ScanLog.Status.SUCCESS
    ).exists()


def test_double_redeem_rejected():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    voucher = _issued_voucher(business, customer, campaign)

    CampaignRewardService.redeem_reward_voucher(staff, code=voucher.voucher_code)
    with pytest.raises(JaqynAPIException) as exc:
        CampaignRewardService.redeem_reward_voucher(staff, code=voucher.voucher_code)

    assert exc.value.code == "VOUCHER_ALREADY_REDEEMED"


def test_expired_voucher_rejected():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    voucher = _issued_voucher(business, customer, campaign)
    voucher.expires_at = timezone.now() - timedelta(minutes=1)
    voucher.save(update_fields=["expires_at"])

    with pytest.raises(JaqynAPIException) as exc:
        CampaignRewardService.redeem_reward_voucher(staff, code=voucher.voucher_code)

    assert exc.value.code == "VOUCHER_EXPIRED"
    voucher.refresh_from_db()
    assert voucher.status == CampaignRewardVoucher.Status.EXPIRED


def test_wrong_business_redeem_rejected():
    business = make_business("101")
    other = make_business("102")
    customer = make_customer()
    staff = make_staff(other, suffix="102")
    campaign = make_campaign(business, required_count=1)
    voucher = _issued_voucher(business, customer, campaign)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignRewardService.redeem_reward_voucher(staff, code=voucher.voucher_code)

    assert exc.value.code == "WRONG_BUSINESS"


def test_validate_voucher_does_not_redeem():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    voucher = _issued_voucher(business, customer, campaign)

    validated = CampaignRewardService.validate_reward_voucher(
        staff, code=voucher.voucher_code
    )

    assert validated.status == CampaignRewardVoucher.Status.ACTIVE
    voucher.refresh_from_db()
    assert voucher.status == CampaignRewardVoucher.Status.ACTIVE


def test_expire_vouchers_batch_marks_overdue():
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, required_count=1)
    voucher = _issued_voucher(business, customer, campaign)
    voucher.expires_at = timezone.now() - timedelta(hours=1)
    voucher.save(update_fields=["expires_at"])

    expired = CampaignRewardService.expire_vouchers()

    assert expired == 1
    voucher.refresh_from_db()
    assert voucher.status == CampaignRewardVoucher.Status.EXPIRED
    # Idempotent: a second run touches nothing.
    assert CampaignRewardService.expire_vouchers() == 0


def test_manager_cancel_writes_audit_and_revokes():
    business = make_business()
    customer = make_customer()
    manager = make_staff(business, role=StaffMember.Role.MANAGER)
    campaign = make_campaign(business, required_count=1)
    voucher = _issued_voucher(business, customer, campaign)

    cancelled = CampaignRewardService.cancel_voucher(
        voucher.id, manager, reason="Issued in error"
    )

    assert cancelled.status == CampaignRewardVoucher.Status.CANCELLED
    assert cancelled.cancel_reason == "Issued in error"
    assert AdminAuditLog.objects.filter(
        action="cancel_campaign_voucher", target_id=str(voucher.id)
    ).exists()


def test_non_manager_cannot_cancel():
    business = make_business()
    customer = make_customer()
    cashier = make_staff(business, role=StaffMember.Role.CASHIER)
    campaign = make_campaign(business, required_count=1)
    voucher = _issued_voucher(business, customer, campaign)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignRewardService.cancel_voucher(voucher.id, cashier, reason="Nope")

    assert exc.value.code == "PERMISSION_DENIED"
    voucher.refresh_from_db()
    assert voucher.status == CampaignRewardVoucher.Status.ACTIVE


def test_cancel_requires_reason():
    business = make_business()
    customer = make_customer()
    manager = make_staff(business, role=StaffMember.Role.MANAGER)
    campaign = make_campaign(business, required_count=1)
    voucher = _issued_voucher(business, customer, campaign)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignRewardService.cancel_voucher(voucher.id, manager, reason="   ")

    assert exc.value.code == "VALIDATION_ERROR"


def test_cancel_voucher_other_business_rejected():
    business = make_business("201")
    other = make_business("202")
    customer = make_customer()
    manager = make_staff(other, role=StaffMember.Role.MANAGER, suffix="202")
    campaign = make_campaign(business, required_count=1)
    voucher = _issued_voucher(business, customer, campaign)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignRewardService.cancel_voucher(voucher.id, manager, reason="x")

    assert exc.value.code == "WRONG_BUSINESS"
