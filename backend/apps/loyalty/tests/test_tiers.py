from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.loyalty.models import LoyaltyProgram, LoyaltyTier
from apps.loyalty.services import (
    LoyaltyEarningService,
    LoyaltyMembershipService,
    LoyaltyProgramService,
    LoyaltyTierService,
)
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException


@pytest.fixture
def actors():
    owner = User.objects.create_user(
        phone="+996700002301", role=User.Role.BUSINESS_OWNER
    )
    customer = User.objects.create_user(phone="+996700002302", role=User.Role.CUSTOMER)
    staff_user = User.objects.create_user(phone="+996700002303", role=User.Role.STAFF)
    business = Business.objects.create(
        owner=owner, name="Tier Cafe", status=Business.Status.APPROVED
    )
    staff = StaffMember.objects.create(
        user=staff_user, business=business, name="Cashier"
    )
    return owner, customer, staff, business


# Ladder used across tests: Bronze from the first visit, Silver at 5, Gold at 10.
LADDER = [
    {"name": "Bronze", "min_visits": 0, "cashback_percent": "3.00"},
    {"name": "Silver", "min_visits": 5, "cashback_percent": "5.00"},
    {"name": "Gold", "min_visits": 10, "cashback_percent": "8.00"},
]


def tiered_program(business: Business, **overrides) -> LoyaltyProgram:
    values = {
        "type": LoyaltyProgram.Type.POINTS,
        "name": "Status cashback",
        "points_basis": LoyaltyProgram.PointsBasis.SPEND,
        "cashback_per_point": Decimal("1.00"),
        "min_redeem_points": 10,
        "tiers": [dict(tier) for tier in LADDER],
    }
    values.update(overrides)
    return LoyaltyProgramService.create(business, business.owner, **values)


# ---- standing resolution ------------------------------------------------------


@pytest.mark.django_db
def test_standing_resolves_current_and_next_rung(actors):
    _, _, _, business = actors
    program = tiered_program(business)
    first = LoyaltyTierService.standing(program, 0)
    assert first.current.name == "Bronze"
    assert first.next_tier.name == "Silver"
    assert first.visits_to_next == 5
    mid = LoyaltyTierService.standing(program, 7)
    assert mid.current.name == "Silver"
    assert mid.visits_to_next == 3
    top = LoyaltyTierService.standing(program, 25)
    assert top.current.name == "Gold"
    assert top.next_tier is None
    assert top.visits_to_next is None


# ---- earning ------------------------------------------------------------------


@pytest.mark.django_db
def test_tiered_award_prices_bill_at_current_rung(actors):
    _, customer, staff, business = actors
    program = tiered_program(business)
    result = LoyaltyEarningService.award(program, customer, staff, Decimal("1000"))
    # First visit holds Bronze (3%): 1000 × 3% / 1 som-per-point = 30 points.
    assert result.points_awarded == 30
    assert result.membership.visits_count == 1
    tx = result.membership.transactions.latest("created_at")
    assert tx.metadata["tier"] == "Bronze"


@pytest.mark.django_db
def test_rung_reached_by_a_visit_prices_that_same_bill(actors):
    _, customer, staff, business = actors
    program = tiered_program(business)
    for _ in range(4):
        LoyaltyEarningService.award(program, customer, staff, Decimal("100"))
    # The 5th visit reaches Silver (5%), so this bill is priced at 5%.
    result = LoyaltyEarningService.award(program, customer, staff, Decimal("1000"))
    assert result.membership.visits_count == 5
    assert result.points_awarded == 50


@pytest.mark.django_db
def test_flat_rate_program_still_earns_without_ladder(actors):
    _, customer, staff, business = actors
    program = LoyaltyProgramService.create(
        business,
        business.owner,
        type=LoyaltyProgram.Type.POINTS,
        name="Flat five",
        points_basis=LoyaltyProgram.PointsBasis.SPEND,
        points_per_som=Decimal("0.05"),
        cashback_per_point=Decimal("1.00"),
        min_redeem_points=10,
    )
    result = LoyaltyEarningService.award(program, customer, staff, Decimal("1000"))
    assert result.points_awarded == 50
    # Visits are counted for every points award so a ladder added later starts
    # from the customer's real history.
    assert result.membership.visits_count == 1


# ---- card projection ----------------------------------------------------------


@pytest.mark.django_db
def test_card_view_exposes_ladder_and_customer_standing(actors):
    _, customer, staff, business = actors
    program = tiered_program(business)
    for _ in range(5):
        LoyaltyEarningService.award(program, customer, staff, Decimal("100"))
    card = LoyaltyMembershipService.card_view(program, customer)
    assert [tier.name for tier in card.tiers] == ["Bronze", "Silver", "Gold"]
    assert card.current_tier_name == "Silver"
    assert card.next_tier_name == "Gold"
    assert card.next_tier_visits_left == 5
    # pct_back reflects the customer's rung, not a flat program rate.
    assert card.pct_back == Decimal("5.00")


@pytest.mark.django_db
def test_card_view_without_ladder_keeps_flat_pct_back(actors):
    _, customer, _, business = actors
    program = LoyaltyProgramService.create(
        business,
        business.owner,
        type=LoyaltyProgram.Type.POINTS,
        name="Flat five",
        points_basis=LoyaltyProgram.PointsBasis.SPEND,
        points_per_som=Decimal("0.05"),
        cashback_per_point=Decimal("1.00"),
        min_redeem_points=10,
    )
    card = LoyaltyMembershipService.card_view(program, customer)
    assert card.tiers == []
    assert card.current_tier_name is None
    assert card.pct_back == Decimal("5.0000")


# ---- ladder validation ---------------------------------------------------------


@pytest.mark.django_db
@pytest.mark.parametrize(
    "tiers",
    [
        # first rung must start at 0 visits
        [{"name": "Silver", "min_visits": 5, "cashback_percent": "5.00"}],
        # thresholds must strictly increase
        [
            {"name": "Bronze", "min_visits": 0, "cashback_percent": "3.00"},
            {"name": "Silver", "min_visits": 0, "cashback_percent": "5.00"},
        ],
        # names must be unique (case-insensitive)
        [
            {"name": "Gold", "min_visits": 0, "cashback_percent": "3.00"},
            {"name": "gold", "min_visits": 5, "cashback_percent": "5.00"},
        ],
        # percent must be within (0, 100]
        [{"name": "Bronze", "min_visits": 0, "cashback_percent": "0.00"}],
        [{"name": "Bronze", "min_visits": 0, "cashback_percent": "150.00"}],
        # at most six rungs
        [
            {"name": f"T{i}", "min_visits": i, "cashback_percent": "1.00"}
            for i in range(7)
        ],
    ],
)
def test_invalid_ladders_are_rejected(actors, tiers):
    _, _, _, business = actors
    with pytest.raises(JaqynAPIException):
        tiered_program(business, tiers=tiers)


@pytest.mark.django_db
def test_ladder_requires_spend_basis_points_program(actors):
    _, _, _, business = actors
    with pytest.raises(JaqynAPIException):
        tiered_program(
            business,
            points_basis=LoyaltyProgram.PointsBasis.VISIT,
            points_per_visit=5,
        )
    with pytest.raises(JaqynAPIException):
        LoyaltyProgramService.create(
            business,
            business.owner,
            type=LoyaltyProgram.Type.STAMP,
            name="Stamps",
            required_count=6,
            reward_type=LoyaltyProgram.RewardType.FREE_ITEM,
            reward_title="Free coffee",
            tiers=[dict(tier) for tier in LADDER],
        )


@pytest.mark.django_db
def test_removing_ladder_requires_flat_rate_again(actors):
    _, _, _, business = actors
    program = tiered_program(business)  # ladder replaces the flat rate
    with pytest.raises(JaqynAPIException):
        LoyaltyProgramService.update(program, tiers=[])


@pytest.mark.django_db
def test_update_replaces_ladder_wholesale(actors):
    _, _, _, business = actors
    program = tiered_program(business)
    LoyaltyProgramService.update(
        program,
        tiers=[
            {"name": "Fan", "min_visits": 0, "cashback_percent": "4.00"},
            {"name": "Regular", "min_visits": 8, "cashback_percent": "7.00"},
        ],
    )
    assert list(program.tiers.values_list("name", flat=True)) == ["Fan", "Regular"]
    assert LoyaltyTier.objects.filter(program=program).count() == 2


# ---- API ----------------------------------------------------------------------


@pytest.mark.django_db
def test_owner_creates_tiered_program_and_customer_sees_ladder(actors):
    owner, customer, staff, business = actors
    client = APIClient()
    client.force_authenticate(owner)
    response = client.post(
        "/api/business/loyalty/programs/",
        {
            "type": "points",
            "name": "Status cashback",
            "points_basis": "spend",
            "cashback_per_point": "1.00",
            "min_redeem_points": 10,
            "tiers": LADDER,
        },
        format="json",
    )
    assert response.status_code == 201
    assert [t["name"] for t in response.data["data"]["tiers"]] == [
        "Bronze",
        "Silver",
        "Gold",
    ]
    program = LoyaltyProgram.objects.get(id=response.data["data"]["id"])
    LoyaltyEarningService.award(program, customer, staff, Decimal("1000"))

    client.force_authenticate(customer)
    cards = client.get(f"/api/customer/loyalty/businesses/{business.id}/loyalty/")
    assert cards.status_code == 200
    row = cards.data["data"]["results"][0]
    assert row["current_tier_name"] == "Bronze"
    assert row["next_tier_name"] == "Silver"
    assert row["next_tier_visits_left"] == 4
    assert [t["name"] for t in row["tiers"]] == ["Bronze", "Silver", "Gold"]


@pytest.mark.django_db
def test_tier_endpoints_enforce_roles(actors):
    _, customer, _, _ = actors
    client = APIClient()
    body = {
        "type": "points",
        "name": "Status cashback",
        "points_basis": "spend",
        "cashback_per_point": "1.00",
        "tiers": LADDER,
    }
    assert (
        client.post("/api/business/loyalty/programs/", body, format="json").status_code
        == 401
    )
    client.force_authenticate(customer)
    assert (
        client.post("/api/business/loyalty/programs/", body, format="json").status_code
        == 403
    )
