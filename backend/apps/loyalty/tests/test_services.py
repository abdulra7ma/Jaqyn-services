from decimal import Decimal

import pytest

from apps.accounts.models import User
from apps.businesses.models import Business, CatalogItem
from apps.loyalty.models import LoyaltyProgram, LoyaltyVoucher
from apps.loyalty.services import (
    LoyaltyEarningService,
    LoyaltyMembershipService,
    LoyaltyRedemptionService,
)
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException


@pytest.fixture
def actors():
    owner = User.objects.create_user(
        phone="+996700000101", role=User.Role.BUSINESS_OWNER
    )
    customer = User.objects.create_user(phone="+996700000102", role=User.Role.CUSTOMER)
    staff_user = User.objects.create_user(phone="+996700000103", role=User.Role.STAFF)
    business = Business.objects.create(
        owner=owner, name="Test Cafe", status=Business.Status.APPROVED
    )
    staff = StaffMember.objects.create(
        user=staff_user, business=business, name="Cashier"
    )
    return business, customer, staff


def points_program(business: Business, **overrides):
    values = {
        "business": business,
        "type": LoyaltyProgram.Type.POINTS,
        "name": "Five percent back",
        "points_basis": LoyaltyProgram.PointsBasis.SPEND,
        "points_per_som": Decimal("0.05"),
        "cashback_per_point": Decimal("1.00"),
        "min_redeem_points": 10,
    }
    values.update(overrides)
    return LoyaltyProgram.objects.create(**values)


@pytest.mark.django_db
def test_membership_get_or_create_is_idempotent(actors):
    business, customer, _ = actors
    program = points_program(business)
    first, created = LoyaltyMembershipService.get_or_create_membership(
        program, customer
    )
    second, created_again = LoyaltyMembershipService.get_or_create_membership(
        program, customer
    )
    assert created is True
    assert created_again is False
    assert first.pk == second.pk


@pytest.mark.django_db
def test_spend_points_floor_math_and_requires_bill(actors):
    business, customer, staff = actors
    program = points_program(business)
    result = LoyaltyEarningService.award(program, customer, staff, Decimal("999.99"))
    assert result.points_awarded == 49
    assert result.membership.points_balance == 49
    assert result.membership.current_spend == Decimal("999.99")
    with pytest.raises(JaqynAPIException) as exc:
        LoyaltyEarningService.award(program, customer, staff)
    assert exc.value.code == "BILL_REQUIRED"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("program_type", "field"),
    [
        (LoyaltyProgram.Type.STAMP, "stamps_count"),
        (LoyaltyProgram.Type.VISIT, "visits_count"),
    ],
)
def test_count_completion_mints_voucher(actors, program_type, field):
    business, customer, staff = actors
    program = LoyaltyProgram.objects.create(
        business=business,
        type=program_type,
        name="Reward card",
        required_count=2,
        reward_type=LoyaltyProgram.RewardType.DISCOUNT,
        reward_title="20% off",
    )
    LoyaltyEarningService.award(program, customer, staff)
    result = LoyaltyEarningService.award(program, customer, staff)
    assert getattr(result.membership, field) == 0
    assert result.membership.cycle == 1
    assert result.voucher is not None
    assert result.voucher.qr_token.type == "loyalty_reward"


@pytest.mark.django_db
def test_stamp_max_banked_caps_new_vouchers(actors):
    business, customer, staff = actors
    program = LoyaltyProgram.objects.create(
        business=business,
        type=LoyaltyProgram.Type.STAMP,
        name="Stamp card",
        required_count=1,
        max_banked=1,
        reward_type=LoyaltyProgram.RewardType.FREE_ITEM,
        reward_title="Free drink",
    )
    LoyaltyEarningService.award(program, customer, staff)
    second = LoyaltyEarningService.award(program, customer, staff)
    assert second.voucher is None
    assert LoyaltyVoucher.objects.filter(program=program).count() == 1


@pytest.mark.django_db
def test_points_redemption_and_insufficient_balance(actors):
    business, customer, staff = actors
    program = points_program(business)
    LoyaltyEarningService.award(program, customer, staff, Decimal("1000"))
    voucher = LoyaltyRedemptionService.redeem_points(program, customer, 20)
    assert voucher.cashback_amount == Decimal("20.00")
    assert voucher.membership.points_balance == 30
    with pytest.raises(JaqynAPIException) as exc:
        LoyaltyRedemptionService.redeem_points(program, customer, 40)
    assert exc.value.code == "INSUFFICIENT_POINTS"


@pytest.mark.django_db
def test_select_item_rejects_other_business_and_redeems(actors):
    business, customer, staff = actors
    other = Business.objects.create(name="Other")
    program = LoyaltyProgram.objects.create(
        business=business,
        type=LoyaltyProgram.Type.VISIT,
        name="Choose reward",
        required_count=1,
        reward_type=LoyaltyProgram.RewardType.FREE_ITEM,
        reward_title="Choose one",
        item_selection=LoyaltyProgram.ItemSelection.CUSTOMER,
    )
    voucher = LoyaltyEarningService.award(program, customer, staff).voucher
    wrong_item = CatalogItem.objects.create(business=other, name="Wrong")
    with pytest.raises(JaqynAPIException) as exc:
        LoyaltyRedemptionService.select_voucher_item(voucher, wrong_item, customer)
    assert exc.value.code == "CATALOG_ITEM_NOT_FOUND"
    item = CatalogItem.objects.create(business=business, name="Coffee")
    LoyaltyRedemptionService.select_voucher_item(voucher, item, customer)
    redeemed = LoyaltyRedemptionService.redeem_voucher(staff, code=voucher.voucher_code)
    assert redeemed.status == LoyaltyVoucher.Status.REDEEMED
