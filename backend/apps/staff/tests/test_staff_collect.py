"""
Tests for POST /api/staff/collect/ (staff_collect service + StaffCollectView).
"""
import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption, RewardTransaction
from apps.qr.models import QRCodeToken
from apps.qr.services import get_or_create_customer_profile_token, get_or_create_merchant_collect_token, staff_token
from apps.staff.models import StaffMember


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_business(suffix="c01"):
    owner = User.objects.create_user(
        phone=f"+996707{suffix}",
        role=User.Role.BUSINESS_OWNER,
        is_phone_verified=True,
    )
    return Business.objects.create(
        owner=owner,
        name=f"Collect Cafe {suffix}",
        category="cafe",
        address="Main 1",
        area="center",
        phone=f"+996708{suffix}",
        working_hours={},
        status=Business.Status.APPROVED,
    )


def make_staff(business, role=StaffMember.Role.CASHIER):
    return StaffMember.objects.create(business=business, name="Cashier", role=role)


def login_staff(api_client, staff):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {staff_token(staff)}")


def make_customer(phone="+996701000001"):
    user = User.objects.create_user(phone=phone, role=User.Role.CUSTOMER, is_phone_verified=True)
    user.name = "Ali Bekov"
    user.save(update_fields=["name"])
    return user


def make_stamp_program(business, required_count=3):
    return RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.STAMP,
        title="Free coffee",
        description="Collect stamps",
        required_count=required_count,
        reward_description="One free drink",
    )


def make_spend_program(business, required_spend="100.00"):
    from decimal import Decimal
    return RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.SPEND,
        title="Spend reward",
        description="Spend to earn",
        required_spend=Decimal(required_spend),
        reward_description="Free item",
    )


def customer_profile_token(customer):
    return get_or_create_customer_profile_token(customer).token


# ---------------------------------------------------------------------------
# Tests: stamp program
# ---------------------------------------------------------------------------

def test_stamp_scan_increments_count_and_returns_awarded(api_client, settings):
    settings.COLLECT_MIN_INTERVAL_SECONDS = 0
    business = make_business("c02")
    staff = make_staff(business)
    login_staff(api_client, staff)
    make_stamp_program(business, required_count=3)
    customer = make_customer("+996701000002")
    token = customer_profile_token(customer)

    response = api_client.post("/api/staff/collect/", {"token": token}, format="json")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["state"] == "awarded"
    assert data["customer"]["name"] == "Ali Bekov"
    assert data["program"]["type"] == "stamp"
    assert data["progress"]["current_count"] == 1
    assert data["progress"]["target_count"] == 3
    assert data["reward"] is None
    assert data["redemption"] is None
    assert RewardTransaction.objects.filter(
        customer=customer,
        action=RewardTransaction.Action.EARNED,
        source=RewardTransaction.Source.STAFF_MANUAL,
    ).count() == 1


def test_final_stamp_mints_voucher_and_returns_awarded(api_client, settings):
    """
    Banking-rewards spec: completing a stamp card now returns 'awarded' with rewards_earned=1
    (NOT reward_ready). Progress stays ACTIVE. Voucher is banked in wallet.
    """
    settings.COLLECT_MIN_INTERVAL_SECONDS = 0
    settings.COLLECT_DAILY_LIMIT = 100
    business = make_business("c03")
    staff = make_staff(business)
    login_staff(api_client, staff)
    make_stamp_program(business, required_count=1)
    customer = make_customer("+996701000003")
    token = customer_profile_token(customer)

    response = api_client.post("/api/staff/collect/", {"token": token}, format="json")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["state"] == "awarded"
    assert data["rewards_earned"] == 1
    assert data["bank_full"] is False
    assert data["reward"] is None      # reward_ready has a reward block; awarded does not
    assert data["redemption"] is None  # redemption block only on reward_ready
    # Progress is ACTIVE, count reset to 0
    progress = CustomerRewardProgress.objects.get(customer=customer)
    assert progress.status == CustomerRewardProgress.Status.ACTIVE
    assert progress.current_count == 0
    assert progress.completed_count == 1
    # Voucher minted and sitting in wallet
    assert RewardRedemption.objects.filter(customer=customer, status=RewardRedemption.Status.PENDING).count() == 1


# ---------------------------------------------------------------------------
# Tests: spend program
# ---------------------------------------------------------------------------

def test_spend_scan_without_amount_returns_needs_amount(api_client, settings):
    settings.COLLECT_MIN_INTERVAL_SECONDS = 0
    business = make_business("c04")
    staff = make_staff(business)
    login_staff(api_client, staff)
    make_spend_program(business, required_spend="200.00")
    customer = make_customer("+996701000004")
    token = customer_profile_token(customer)

    response = api_client.post("/api/staff/collect/", {"token": token}, format="json")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["state"] == "needs_amount"
    assert data["program"]["type"] == "spend"
    assert RewardTransaction.objects.filter(customer=customer).count() == 0


def test_spend_scan_with_amount_returns_awarded(api_client, settings):
    settings.COLLECT_MIN_INTERVAL_SECONDS = 0
    business = make_business("c05")
    staff = make_staff(business)
    login_staff(api_client, staff)
    make_spend_program(business, required_spend="200.00")
    customer = make_customer("+996701000005")
    token = customer_profile_token(customer)

    response = api_client.post("/api/staff/collect/", {"token": token, "amount": "50.00"}, format="json")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["state"] == "awarded"
    assert data["progress"]["current_spend"] == "50.00"
    assert RewardTransaction.objects.filter(
        customer=customer,
        action=RewardTransaction.Action.EARNED,
        source=RewardTransaction.Source.STAFF_MANUAL,
    ).count() == 1


# ---------------------------------------------------------------------------
# Tests: no cooldown — every staff scan earns (multiple purchases in a day)
# ---------------------------------------------------------------------------

def test_repeated_scans_each_award_no_cooldown(api_client, settings):
    # Even with restrictive legacy cooldown settings, staff scans ignore them.
    settings.COLLECT_MIN_INTERVAL_SECONDS = 99999
    settings.COLLECT_DAILY_LIMIT = 1
    business = make_business("c06")
    staff = make_staff(business)
    login_staff(api_client, staff)
    make_stamp_program(business, required_count=5)
    customer = make_customer("+996701000006")
    token = customer_profile_token(customer)

    first = api_client.post("/api/staff/collect/", {"token": token}, format="json")
    second = api_client.post("/api/staff/collect/", {"token": token}, format="json")

    assert first.status_code == 200
    assert first.data["data"]["state"] == "awarded"
    assert first.data["data"]["progress"]["current_count"] == 1
    # Second scan in the same window also earns — a real repeat purchase.
    assert second.status_code == 200
    assert second.data["data"]["state"] == "awarded"
    assert second.data["data"]["progress"]["current_count"] == 2
    assert RewardTransaction.objects.filter(
        customer=customer, action=RewardTransaction.Action.EARNED
    ).count() == 2


# ---------------------------------------------------------------------------
# Tests: wrong business
# ---------------------------------------------------------------------------

def test_scanning_other_business_customer_qr_raises_wrong_business(api_client, settings):
    settings.COLLECT_MIN_INTERVAL_SECONDS = 0
    business_a = make_business("c07")
    business_b = make_business("c08")
    staff_b = make_staff(business_b)
    login_staff(api_client, staff_b)
    make_stamp_program(business_b, required_count=3)
    # customer profile QR doesn't belong to a business — but business_b has no reason
    # to reject a customer. However, scanning a MERCHANT_COLLECT token (not customer_profile) should be rejected.
    # Here we test: staff_b scans a MERCHANT_COLLECT token of business_a -> INVALID_QR_TOKEN
    merchant_token = get_or_create_merchant_collect_token(business_a)

    response = api_client.post("/api/staff/collect/", {"token": merchant_token.token}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "INVALID_QR_TOKEN"


def test_scanning_wrong_business_qr_type_raises_invalid_qr_token(api_client, settings):
    """Non-customer_profile tokens (e.g. reward_redeem) must raise INVALID_QR_TOKEN."""
    settings.COLLECT_MIN_INTERVAL_SECONDS = 0
    business = make_business("c09")
    staff = make_staff(business)
    login_staff(api_client, staff)
    make_stamp_program(business, required_count=1)
    customer = make_customer("+996701000009")

    # Create a REWARD_REDEEM token (not a customer_profile token)
    from apps.loyalty.services import create_redemption
    progress = CustomerRewardProgress.objects.create(
        customer=customer,
        business=business,
        reward_program=RewardProgram.objects.get(business=business),
        current_count=1,
        target_count=1,
        status=CustomerRewardProgress.Status.UNLOCKED,
        unlocked_at=timezone.now(),
    )
    redemption = create_redemption(progress)
    redeem_qr = redemption.qr_tokens.get().token

    response = api_client.post("/api/staff/collect/", {"token": redeem_qr}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "INVALID_QR_TOKEN"


# ---------------------------------------------------------------------------
# Tests: idempotent reward_ready
# ---------------------------------------------------------------------------

def test_rescanning_stacks_second_voucher(api_client, settings):
    """
    Banking-rewards spec: rescanning after first card completes stacks a second voucher.
    Both scans return 'awarded' (no reward_ready until customer presents a voucher).
    """
    settings.COLLECT_MIN_INTERVAL_SECONDS = 0
    settings.COLLECT_DAILY_LIMIT = 100
    business = make_business("c10")
    staff = make_staff(business)
    login_staff(api_client, staff)
    make_stamp_program(business, required_count=1)
    customer = make_customer("+996701000010")
    token = customer_profile_token(customer)

    first = api_client.post("/api/staff/collect/", {"token": token}, format="json")
    second = api_client.post("/api/staff/collect/", {"token": token}, format="json")

    assert first.data["data"]["state"] == "awarded"
    assert first.data["data"]["rewards_earned"] == 1
    assert second.data["data"]["state"] == "awarded"
    assert second.data["data"]["rewards_earned"] == 1
    # Two distinct vouchers banked
    assert RewardRedemption.objects.filter(customer=customer, status=RewardRedemption.Status.PENDING).count() == 2
