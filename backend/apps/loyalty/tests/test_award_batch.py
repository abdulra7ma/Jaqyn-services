from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.loyalty.models import LoyaltyProgram, LoyaltyVoucher
from apps.loyalty.services import (
    LoyaltyAwardItem,
    LoyaltyEarningService,
    LoyaltyProgramService,
)
from apps.qr.services import get_or_create_customer_profile_token
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException


@pytest.fixture
def actors():
    owner = User.objects.create_user(
        phone="+996700003401", role=User.Role.BUSINESS_OWNER
    )
    customer = User.objects.create_user(
        phone="+996700003402", role=User.Role.CUSTOMER, name="Bek"
    )
    staff_user = User.objects.create_user(phone="+996700003403", role=User.Role.STAFF)
    business = Business.objects.create(
        owner=owner, name="Batch Cafe", status=Business.Status.APPROVED
    )
    staff = StaffMember.objects.create(
        user=staff_user, business=business, name="Cashier"
    )
    return owner, customer, staff, business


def stamp_program(business: Business, **overrides) -> LoyaltyProgram:
    values = {
        "type": LoyaltyProgram.Type.STAMP,
        "name": "Coffee card",
        "required_count": 6,
        "reward_type": LoyaltyProgram.RewardType.FREE_ITEM,
        "reward_title": "Free coffee",
    }
    values.update(overrides)
    return LoyaltyProgramService.create(business, business.owner, **values)


def cashback_program(business: Business, **overrides) -> LoyaltyProgram:
    values = {
        "type": LoyaltyProgram.Type.POINTS,
        "name": "Cashback",
        "points_basis": LoyaltyProgram.PointsBasis.SPEND,
        "points_per_som": Decimal("0.05"),
        "cashback_per_point": Decimal("1.00"),
        "min_redeem_points": 10,
    }
    values.update(overrides)
    return LoyaltyProgramService.create(business, business.owner, **values)


# ---- quantity awards ------------------------------------------------------------


@pytest.mark.django_db
def test_quantity_award_applies_all_stamps_at_once(actors):
    _, customer, staff, business = actors
    program = stamp_program(business)
    result = LoyaltyEarningService.award(program, customer, staff, quantity=5)
    assert result.membership.stamps_count == 5
    assert result.vouchers == []
    tx = result.membership.transactions.latest("created_at")
    assert tx.stamps_delta == 5


@pytest.mark.django_db
def test_quantity_award_can_complete_multiple_cycles(actors):
    _, customer, staff, business = actors
    program = stamp_program(business, required_count=2)
    # 5 stamps on a 2-stamp card = 2 vouchers + 1 leftover stamp.
    result = LoyaltyEarningService.award(program, customer, staff, quantity=5)
    assert len(result.vouchers) == 2
    assert result.membership.stamps_count == 1
    assert result.membership.cycle == 2


@pytest.mark.django_db
def test_quantity_award_respects_max_banked(actors):
    _, customer, staff, business = actors
    program = stamp_program(business, required_count=2, max_banked=1)
    # Only one voucher can be banked; the rest of the stamps accumulate.
    result = LoyaltyEarningService.award(program, customer, staff, quantity=6)
    assert len(result.vouchers) == 1
    assert result.membership.stamps_count == 4
    assert LoyaltyVoucher.objects.filter(program=program).count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize("quantity", [0, 31])
def test_quantity_out_of_bounds_rejected(actors, quantity):
    _, customer, staff, business = actors
    program = stamp_program(business)
    with pytest.raises(JaqynAPIException):
        LoyaltyEarningService.award(program, customer, staff, quantity=quantity)


@pytest.mark.django_db
def test_quantity_above_one_rejected_for_non_stamp(actors):
    _, customer, staff, business = actors
    program = cashback_program(business)
    with pytest.raises(JaqynAPIException):
        LoyaltyEarningService.award(
            program, customer, staff, Decimal("100"), quantity=2
        )


# ---- combined batch --------------------------------------------------------------


@pytest.mark.django_db
def test_batch_awards_stamps_and_cashback_together(actors):
    _, customer, staff, business = actors
    stamps = stamp_program(business, required_count=6)
    cashback = cashback_program(business)
    results = LoyaltyEarningService.award_batch(
        customer,
        staff,
        [
            LoyaltyAwardItem(program=stamps, bill_amount=None, quantity=5),
            LoyaltyAwardItem(program=cashback, bill_amount=Decimal("1000"), quantity=1),
        ],
    )
    assert results[0].membership.stamps_count == 5
    # 5% flat rate on 1000 som = 50 points.
    assert results[1].points_awarded == 50


@pytest.mark.django_db
def test_batch_is_atomic_when_one_leg_fails(actors):
    _, customer, staff, business = actors
    stamps = stamp_program(business)
    cashback = cashback_program(business)
    with pytest.raises(JaqynAPIException):
        LoyaltyEarningService.award_batch(
            customer,
            staff,
            [
                LoyaltyAwardItem(program=stamps, bill_amount=None, quantity=5),
                # Missing bill on a spend-basis leg fails the whole batch.
                LoyaltyAwardItem(program=cashback, bill_amount=None, quantity=1),
            ],
        )
    memberships = stamps.memberships.filter(customer=customer)
    assert not memberships.exists() or memberships.get().stamps_count == 0


# ---- API ------------------------------------------------------------------------


@pytest.mark.django_db
def test_award_batch_endpoint_happy_path(actors):
    _, customer, staff, business = actors
    stamps = stamp_program(business, required_count=2)
    cashback = cashback_program(business)
    token = get_or_create_customer_profile_token(customer)
    client = APIClient()
    client.force_authenticate(staff.user)
    response = client.post(
        "/api/staff/loyalty/award-batch/",
        {
            "token": token.token,
            "awards": [
                {"program_id": str(stamps.id), "quantity": 5},
                {"program_id": str(cashback.id), "amount": "1000"},
            ],
        },
        format="json",
    )
    assert response.status_code == 200
    data = response.data["data"]
    assert data["customer"] == "Bek"
    by_id = {row["program_id"]: row for row in data["results"]}
    stamp_row = by_id[str(stamps.id)]
    # 5 stamps on a 2-stamp card = 2 vouchers + 1 leftover.
    assert stamp_row["stamps_count"] == 1
    assert len(stamp_row["vouchers"]) == 2
    cash_row = by_id[str(cashback.id)]
    assert cash_row["points_awarded"] == 50
    assert cash_row["points_balance"] == 50


@pytest.mark.django_db
def test_award_batch_endpoint_rejects_duplicates_and_foreign_programs(actors):
    owner, customer, staff, business = actors
    stamps = stamp_program(business)
    other_owner = User.objects.create_user(
        phone="+996700003501", role=User.Role.BUSINESS_OWNER
    )
    other_business = Business.objects.create(
        owner=other_owner, name="Other", status=Business.Status.APPROVED
    )
    foreign = stamp_program(other_business, name="Foreign card")
    token = get_or_create_customer_profile_token(customer)
    client = APIClient()
    client.force_authenticate(staff.user)
    dup = client.post(
        "/api/staff/loyalty/award-batch/",
        {
            "token": token.token,
            "awards": [
                {"program_id": str(stamps.id)},
                {"program_id": str(stamps.id)},
            ],
        },
        format="json",
    )
    assert dup.status_code == 400
    foreign_res = client.post(
        "/api/staff/loyalty/award-batch/",
        {
            "token": token.token,
            "awards": [{"program_id": str(foreign.id)}],
        },
        format="json",
    )
    assert foreign_res.status_code == 404


@pytest.mark.django_db
def test_award_batch_endpoint_enforces_roles(actors):
    _, customer, _, business = actors
    stamps = stamp_program(business)
    body = {"token": "x", "awards": [{"program_id": str(stamps.id)}]}
    client = APIClient()
    assert (
        client.post("/api/staff/loyalty/award-batch/", body, format="json").status_code
        == 401
    )
    client.force_authenticate(customer)
    assert (
        client.post("/api/staff/loyalty/award-batch/", body, format="json").status_code
        == 403
    )
