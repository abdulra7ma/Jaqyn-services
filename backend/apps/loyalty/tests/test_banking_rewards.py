"""
Tests for banking-rewards feature (spec §6 + Addendum A).

Covers:
- stamp completion mints + resets + progress stays ACTIVE; 2nd card stacks
- spend ≥ 2× threshold mints 2 vouchers + carries remainder
- present → staff scan returns reward_ready → redeem leaves progress ACTIVE & REDEEMED
- scan with banked-but-not-presented → still awarded (earns a stamp)
- presented past TTL → not reward_ready (falls through to earn)
- cap → bank_full, mints nothing when at cap
- redeem frees slot → held card mints (eager resume)
- wallet groups correctly
- business_reward_card returns available + history
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption, RewardTransaction
from apps.loyalty.services import business_reward_card, customer_wallet, present_redemption, staff_collect
from apps.qr.services import get_or_create_customer_profile_token, staff_token
from apps.staff.models import StaffMember


pytestmark = pytest.mark.django_db

_phone_counter = [0]


def _next_phone(prefix="+9967"):
    _phone_counter[0] += 1
    return f"{prefix}{_phone_counter[0]:08d}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_business(suffix=None):
    suffix = suffix or _next_phone("b")
    owner = User.objects.create_user(
        phone=_next_phone(),
        role=User.Role.BUSINESS_OWNER,
        is_phone_verified=True,
    )
    return Business.objects.create(
        owner=owner,
        name=f"Cafe {suffix}",
        category="cafe",
        address="Main 1",
        area="center",
        phone=_next_phone(),
        working_hours={},
        status=Business.Status.APPROVED,
    )


def make_staff(business):
    return StaffMember.objects.create(business=business, name="Cashier", role=StaffMember.Role.CASHIER)


def make_customer():
    user = User.objects.create_user(
        phone=_next_phone(),
        role=User.Role.CUSTOMER,
        is_phone_verified=True,
    )
    user.name = "Test Customer"
    user.save(update_fields=["name"])
    return user


def make_stamp_program(business, required_count=3, max_banked=None):
    return RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.STAMP,
        title="Free coffee",
        description="Collect stamps",
        required_count=required_count,
        reward_description="One free drink",
        max_banked=max_banked,
    )


def make_spend_program(business, required_spend="100.00", max_banked=None):
    return RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.SPEND,
        title="Spend reward",
        description="Spend to earn",
        required_spend=Decimal(required_spend),
        reward_description="Free item",
        max_banked=max_banked,
    )


def customer_profile_token(customer):
    return get_or_create_customer_profile_token(customer).token


def login_staff(api_client, staff):
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {staff_token(staff)}")


def login_customer(api_client, customer):
    refresh = RefreshToken.for_user(customer)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")


@pytest.fixture
def api_client():
    return APIClient()


# ---------------------------------------------------------------------------
# Test 1: stamp completion mints a voucher, resets count, progress stays ACTIVE
# ---------------------------------------------------------------------------

def test_stamp_completion_mints_resets_and_stays_active():
    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=2)
    customer = make_customer()
    token = customer_profile_token(customer)

    # First stamp: no mint
    result = staff_collect(staff, token)
    assert result["state"] == "awarded"
    assert result["rewards_earned"] == 0
    assert result["bank_full"] is False

    progress = CustomerRewardProgress.objects.get(customer=customer, business=business, reward_program=program)
    assert progress.current_count == 1
    assert progress.status == CustomerRewardProgress.Status.ACTIVE

    # Second stamp: mints
    result = staff_collect(staff, token)
    assert result["state"] == "awarded"
    assert result["rewards_earned"] == 1
    assert result["bank_full"] is False

    progress.refresh_from_db()
    assert progress.current_count == 0  # reset
    assert progress.completed_count == 1
    assert progress.status == CustomerRewardProgress.Status.ACTIVE  # stays ACTIVE

    vouchers = RewardRedemption.objects.filter(customer=customer, status=RewardRedemption.Status.PENDING)
    assert vouchers.count() == 1


# ---------------------------------------------------------------------------
# Test 2: Second completed card stacks (2 vouchers)
# ---------------------------------------------------------------------------

def test_second_card_stacks():
    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    # Complete card once
    result = staff_collect(staff, token)
    assert result["rewards_earned"] == 1

    progress = CustomerRewardProgress.objects.get(customer=customer, business=business, reward_program=program)
    assert progress.current_count == 0
    assert progress.completed_count == 1
    assert progress.status == CustomerRewardProgress.Status.ACTIVE

    # Complete card again → 2nd voucher
    result = staff_collect(staff, token)
    assert result["rewards_earned"] == 1

    progress.refresh_from_db()
    assert progress.completed_count == 2
    assert RewardRedemption.objects.filter(customer=customer, status=RewardRedemption.Status.PENDING).count() == 2


# ---------------------------------------------------------------------------
# Test 3: spend ≥ 2× threshold mints 2 vouchers + carries remainder
# ---------------------------------------------------------------------------

def test_spend_double_threshold_mints_two_and_carries_remainder():
    business = make_business()
    staff = make_staff(business)
    program = make_spend_program(business, required_spend="100.00")
    customer = make_customer()
    token = customer_profile_token(customer)

    # Spend 250 = 2x threshold + 50 remainder
    result = staff_collect(staff, token, amount=Decimal("250.00"))
    assert result["state"] == "awarded"
    assert result["rewards_earned"] == 2

    progress = CustomerRewardProgress.objects.get(customer=customer, business=business, reward_program=program)
    assert progress.current_spend == Decimal("50.00")
    assert progress.completed_count == 2
    assert RewardRedemption.objects.filter(customer=customer, status=RewardRedemption.Status.PENDING).count() == 2


# ---------------------------------------------------------------------------
# Test 4: present → staff scan returns reward_ready → redeem leaves progress ACTIVE
# ---------------------------------------------------------------------------

def test_present_then_staff_scan_returns_reward_ready_and_redeem_leaves_active(api_client, settings):
    settings.REWARD_PRESENT_TTL_SECONDS = 120

    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    # Complete stamp to earn a voucher
    result = staff_collect(staff, token)
    assert result["rewards_earned"] == 1

    voucher = RewardRedemption.objects.filter(customer=customer, status=RewardRedemption.Status.PENDING).first()
    assert voucher is not None

    # Customer presents the voucher
    presented = present_redemption(customer, voucher.id)
    assert presented.presented_at is not None

    # Staff scans again → should get reward_ready (not earn a stamp)
    result2 = staff_collect(staff, token)
    assert result2["state"] == "reward_ready"
    assert result2["redemption"]["id"] == str(voucher.id)

    # Staff redeems via API
    login_staff(api_client, staff)
    resp = api_client.post("/api/staff/redeem/", {"code": voucher.code}, format="json")
    assert resp.status_code == 200

    voucher.refresh_from_db()
    assert voucher.status == RewardRedemption.Status.REDEEMED
    assert voucher.redeemed_at is not None
    assert voucher.presented_at is None  # cleared on redeem

    # Progress must stay ACTIVE
    progress = CustomerRewardProgress.objects.get(customer=customer, business=business, reward_program=program)
    assert progress.status == CustomerRewardProgress.Status.ACTIVE


# ---------------------------------------------------------------------------
# Test 5: scan with banked-but-not-presented rewards → still awarded
# ---------------------------------------------------------------------------

def test_scan_with_banked_but_not_presented_still_awards():
    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    # Earn a voucher (it is banked, but not presented)
    result1 = staff_collect(staff, token)
    assert result1["rewards_earned"] == 1

    voucher = RewardRedemption.objects.get(customer=customer, status=RewardRedemption.Status.PENDING)
    assert voucher.presented_at is None

    # Next scan: no presented_at → should award (earn another stamp), NOT reward_ready
    result2 = staff_collect(staff, token)
    assert result2["state"] == "awarded"
    assert result2["rewards_earned"] == 1  # reset to 0 then completes again


# ---------------------------------------------------------------------------
# Test 6: presented voucher past TTL → not reward_ready (falls through to earn)
# ---------------------------------------------------------------------------

def test_presented_past_ttl_falls_through_to_earn(settings):
    settings.REWARD_PRESENT_TTL_SECONDS = 60

    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    # Earn + present
    staff_collect(staff, token)
    voucher = RewardRedemption.objects.get(customer=customer, status=RewardRedemption.Status.PENDING)
    voucher.presented_at = timezone.now() - timedelta(seconds=121)
    voucher.save(update_fields=["presented_at"])

    # Now scan: TTL expired → should award, not reward_ready
    result = staff_collect(staff, token)
    assert result["state"] == "awarded"


# ---------------------------------------------------------------------------
# Test 7: cap → bank_full when at max_banked
# ---------------------------------------------------------------------------

def test_cap_bank_full_mints_nothing_when_at_cap():
    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1, max_banked=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    # First completion → mints (under cap)
    result1 = staff_collect(staff, token)
    assert result1["rewards_earned"] == 1
    assert result1["bank_full"] is False

    # Second completion → at cap → bank_full, no new mint
    result2 = staff_collect(staff, token)
    assert result2["state"] == "awarded"
    assert result2["rewards_earned"] == 0
    assert result2["bank_full"] is True

    # Count stays clamped at target
    progress = CustomerRewardProgress.objects.get(customer=customer, business=business, reward_program=program)
    assert progress.current_count == 1  # clamped at target

    # Still only 1 PENDING voucher
    assert RewardRedemption.objects.filter(customer=customer, status=RewardRedemption.Status.PENDING).count() == 1


# ---------------------------------------------------------------------------
# Test 8: redeem frees a slot → held card mints (eager resume)
# ---------------------------------------------------------------------------

def test_redeem_frees_slot_eager_resume(api_client, settings):
    settings.REWARD_PRESENT_TTL_SECONDS = 120

    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1, max_banked=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    # Fill to cap
    staff_collect(staff, token)  # mints 1 (under cap)
    result2 = staff_collect(staff, token)  # at cap, held
    assert result2["bank_full"] is True
    assert result2["rewards_earned"] == 0

    # Verify count is held at target
    progress = CustomerRewardProgress.objects.get(customer=customer, business=business, reward_program=program)
    assert progress.current_count == 1

    # Redeem the existing voucher
    voucher = RewardRedemption.objects.filter(customer=customer, status=RewardRedemption.Status.PENDING).first()
    login_staff(api_client, staff)
    resp = api_client.post("/api/staff/redeem/", {"code": voucher.code}, format="json")
    assert resp.status_code == 200

    # Eager resume: progress should now have minted the held reward
    progress.refresh_from_db()
    assert progress.current_count == 0  # reset after eager mint
    assert progress.completed_count == 2  # 1 original + 1 eager

    new_voucher = RewardRedemption.objects.filter(
        customer=customer,
        status=RewardRedemption.Status.PENDING,
    ).exclude(id=voucher.id).first()
    assert new_voucher is not None


# ---------------------------------------------------------------------------
# Test 9: spend loop stops at cap and carries remainder
# ---------------------------------------------------------------------------

def test_spend_loop_stops_at_cap_and_carries_remainder():
    business = make_business()
    staff = make_staff(business)
    program = make_spend_program(business, required_spend="100.00", max_banked=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    # Spend 250 = 2× threshold; but cap=1 → mints 1, then stops
    result = staff_collect(staff, token, amount=Decimal("250.00"))
    assert result["rewards_earned"] == 1
    assert result["bank_full"] is True

    progress = CustomerRewardProgress.objects.get(customer=customer, business=business, reward_program=program)
    # clamped to required_spend (100), not subtracted twice
    assert progress.current_spend == Decimal("100.00")
    assert RewardRedemption.objects.filter(customer=customer, status=RewardRedemption.Status.PENDING).count() == 1


# ---------------------------------------------------------------------------
# Test 10: wallet endpoint groups available vouchers
# ---------------------------------------------------------------------------

def test_wallet_endpoint_groups_available_vouchers(api_client):
    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    # Earn 2 vouchers from the same program
    staff_collect(staff, token)
    staff_collect(staff, token)

    wallet = customer_wallet(customer)
    assert len(wallet["available"]) == 1  # grouped
    group = wallet["available"][0]
    assert group["count"] == 2
    assert group["business"]["id"] == str(business.id)
    assert group["reward"]["id"] == str(program.id)
    assert len(group["redemption_ids"]) == 2


def test_wallet_endpoint_via_api(api_client):
    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    staff_collect(staff, token)

    login_customer(api_client, customer)
    resp = api_client.get("/api/customer/wallet/")
    assert resp.status_code == 200
    data = resp.data["data"]
    assert "available" in data
    assert "in_progress" in data
    assert len(data["available"]) == 1
    assert data["available"][0]["count"] == 1


# ---------------------------------------------------------------------------
# Test 11: business_reward_card returns available + history
# ---------------------------------------------------------------------------

def test_business_reward_card_returns_available_and_history(api_client, settings):
    settings.REWARD_PRESENT_TTL_SECONDS = 120

    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    # Earn 2 vouchers
    staff_collect(staff, token)
    staff_collect(staff, token)

    # Redeem one
    voucher = RewardRedemption.objects.filter(customer=customer, status=RewardRedemption.Status.PENDING).first()
    voucher.status = RewardRedemption.Status.REDEEMED
    voucher.redeemed_by = staff
    voucher.redeemed_at = timezone.now()
    voucher.save()

    card = business_reward_card(customer, business.id)
    assert card["business"]["id"] == str(business.id)
    assert len(card["programs"]) == 1
    assert card["programs"][0]["available_count"] == 1
    assert len(card["available"]) == 1
    assert len(card["history"]) == 1
    assert card["history"][0]["status"] == "redeemed"


def test_business_reward_card_via_api(api_client):
    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    staff_collect(staff, token)

    login_customer(api_client, customer)
    resp = api_client.get(f"/api/customer/businesses/{business.id}/rewards/")
    assert resp.status_code == 200
    data = resp.data["data"]
    assert data["business"]["id"] == str(business.id)
    assert len(data["available"]) == 1
    assert len(data["history"]) == 0


# ---------------------------------------------------------------------------
# Test 12: present_redemption via API
# ---------------------------------------------------------------------------

def test_present_redemption_api(api_client):
    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    staff_collect(staff, token)
    voucher = RewardRedemption.objects.get(customer=customer, status=RewardRedemption.Status.PENDING)

    login_customer(api_client, customer)
    resp = api_client.post(f"/api/customer/redemptions/{voucher.id}/present/")
    assert resp.status_code == 200
    data = resp.data["data"]
    assert data["presented_at"] is not None
    assert data["id"] == str(voucher.id)


# ---------------------------------------------------------------------------
# Test 13: redeem does NOT flip progress to REDEEMED (service level)
# ---------------------------------------------------------------------------

def test_redeem_does_not_flip_progress_to_redeemed():
    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    staff_collect(staff, token)
    voucher = RewardRedemption.objects.get(customer=customer, status=RewardRedemption.Status.PENDING)

    from apps.loyalty.services import redeem_reward
    redeem_reward(staff, code=voucher.code)

    progress = CustomerRewardProgress.objects.get(customer=customer, business=business, reward_program=program)
    assert progress.status == CustomerRewardProgress.Status.ACTIVE

    voucher.refresh_from_db()
    assert voucher.status == RewardRedemption.Status.REDEEMED


# ---------------------------------------------------------------------------
# Test 14: present clears presented_at on other vouchers
# ---------------------------------------------------------------------------

def test_present_clears_other_presented_at():
    business = make_business()
    staff = make_staff(business)
    program = make_stamp_program(business, required_count=1)
    customer = make_customer()
    token = customer_profile_token(customer)

    # Earn 2 vouchers
    staff_collect(staff, token)
    staff_collect(staff, token)

    vouchers = list(RewardRedemption.objects.filter(customer=customer, status=RewardRedemption.Status.PENDING))
    assert len(vouchers) == 2

    # Present first
    present_redemption(customer, vouchers[0].id)
    vouchers[0].refresh_from_db()
    assert vouchers[0].presented_at is not None

    # Present second: first's presented_at should be cleared
    present_redemption(customer, vouchers[1].id)
    vouchers[0].refresh_from_db()
    vouchers[1].refresh_from_db()
    assert vouchers[0].presented_at is None
    assert vouchers[1].presented_at is not None
