"""
Tests for:
  - staff_collect program_id routing (stamp vs spend when both exist)
  - GET /api/staff/programs/ endpoint
"""
import pytest
from decimal import Decimal

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption, RewardTransaction
from apps.qr.services import get_or_create_customer_profile_token, staff_token
from apps.staff.models import StaffMember


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers (mirror test_staff_collect style)
# ---------------------------------------------------------------------------

def make_business(suffix):
    owner = User.objects.create_user(
        phone=f"+996707{suffix}",
        role=User.Role.BUSINESS_OWNER,
        is_phone_verified=True,
    )
    return Business.objects.create(
        owner=owner,
        name=f"Programs Cafe {suffix}",
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


def make_customer(phone):
    user = User.objects.create_user(phone=phone, role=User.Role.CUSTOMER, is_phone_verified=True)
    user.name = "Test Customer"
    user.save(update_fields=["name"])
    return user


def make_stamp_program(business, required_count=3):
    return RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.STAMP,
        title="Stamp reward",
        description="Collect stamps",
        required_count=required_count,
        reward_description="Free stamp item",
    )


def make_spend_program(business, required_spend="200.00"):
    return RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.SPEND,
        title="Spend reward",
        description="Spend to earn",
        required_spend=Decimal(required_spend),
        reward_description="Free spend item",
    )


def customer_profile_token(customer):
    return get_or_create_customer_profile_token(customer).token


# ---------------------------------------------------------------------------
# Tests: program_id routing with both stamp and spend programs
# ---------------------------------------------------------------------------

def test_program_id_routes_to_stamp_when_both_programs_exist(api_client, settings):
    """Passing stamp program_id awards a stamp even when business also has a spend program."""
    settings.COLLECT_MIN_INTERVAL_SECONDS = 0
    settings.COLLECT_DAILY_LIMIT = 100

    business = make_business("p01")
    staff = make_staff(business)
    login_staff(api_client, staff)

    stamp_program = make_stamp_program(business, required_count=5)
    _spend_program = make_spend_program(business, required_spend="100.00")

    customer = make_customer("+996701000101")
    token = customer_profile_token(customer)

    response = api_client.post(
        "/api/staff/collect/",
        {"token": token, "program_id": str(stamp_program.id)},
        format="json",
    )

    assert response.status_code == 200
    data = response.data["data"]
    assert data["state"] == "awarded"
    assert data["program"]["type"] == "stamp"
    assert data["program"]["id"] == str(stamp_program.id)
    assert data["progress"]["current_count"] == 1

    # Only stamp transaction created, not spend
    assert RewardTransaction.objects.filter(
        customer=customer,
        action=RewardTransaction.Action.EARNED,
        source=RewardTransaction.Source.STAFF_MANUAL,
    ).count() == 1
    txn = RewardTransaction.objects.get(customer=customer, action=RewardTransaction.Action.EARNED)
    assert txn.reward_program_id == stamp_program.id


def test_program_id_routes_to_spend_returns_needs_amount(api_client, settings):
    """Passing spend program_id returns needs_amount when no amount given."""
    settings.COLLECT_MIN_INTERVAL_SECONDS = 0
    settings.COLLECT_DAILY_LIMIT = 100

    business = make_business("p02")
    staff = make_staff(business)
    login_staff(api_client, staff)

    _stamp_program = make_stamp_program(business, required_count=5)
    spend_program = make_spend_program(business, required_spend="100.00")

    customer = make_customer("+996701000102")
    token = customer_profile_token(customer)

    response = api_client.post(
        "/api/staff/collect/",
        {"token": token, "program_id": str(spend_program.id)},
        format="json",
    )

    assert response.status_code == 200
    data = response.data["data"]
    assert data["state"] == "needs_amount"
    assert data["program"]["type"] == "spend"
    assert data["program"]["id"] == str(spend_program.id)
    # No transaction created yet
    assert RewardTransaction.objects.filter(customer=customer).count() == 0


def test_program_id_routes_to_spend_with_amount_awards_spend(api_client, settings):
    """Passing spend program_id with amount awards spend progress."""
    settings.COLLECT_MIN_INTERVAL_SECONDS = 0
    settings.COLLECT_DAILY_LIMIT = 100

    business = make_business("p03")
    staff = make_staff(business)
    login_staff(api_client, staff)

    _stamp_program = make_stamp_program(business, required_count=5)
    spend_program = make_spend_program(business, required_spend="100.00")

    customer = make_customer("+996701000103")
    token = customer_profile_token(customer)

    response = api_client.post(
        "/api/staff/collect/",
        {"token": token, "program_id": str(spend_program.id), "amount": "40.00"},
        format="json",
    )

    assert response.status_code == 200
    data = response.data["data"]
    assert data["state"] == "awarded"
    assert data["program"]["type"] == "spend"
    assert data["program"]["id"] == str(spend_program.id)
    assert data["progress"]["current_spend"] == "40.00"

    txn = RewardTransaction.objects.get(customer=customer, action=RewardTransaction.Action.EARNED)
    assert txn.reward_program_id == spend_program.id
    assert txn.amount_spend == Decimal("40.00")


# ---------------------------------------------------------------------------
# Tests: GET /api/staff/programs/
# ---------------------------------------------------------------------------

def test_programs_endpoint_returns_active_programs_for_staff_business(api_client):
    """GET /api/staff/programs/ returns all active programs ordered by -created_at."""
    business = make_business("p04")
    staff = make_staff(business)
    login_staff(api_client, staff)

    stamp_program = make_stamp_program(business, required_count=6)
    spend_program = make_spend_program(business, required_spend="150.00")

    response = api_client.get("/api/staff/programs/")

    assert response.status_code == 200
    programs = response.data["data"]["programs"]
    assert len(programs) == 2

    ids = [p["id"] for p in programs]
    assert str(stamp_program.id) in ids
    assert str(spend_program.id) in ids

    # Verify response shape
    for p in programs:
        assert "id" in p
        assert "type" in p
        assert "title" in p
        assert "required_count" in p
        assert "required_spend" in p
        assert "reward_description" in p

    stamp_data = next(p for p in programs if p["id"] == str(stamp_program.id))
    assert stamp_data["type"] == "stamp"
    assert stamp_data["required_count"] == 6
    assert stamp_data["required_spend"] is None

    spend_data = next(p for p in programs if p["id"] == str(spend_program.id))
    assert spend_data["type"] == "spend"
    assert spend_data["required_count"] is None
    assert spend_data["required_spend"] == "150.00"


def test_programs_endpoint_excludes_inactive_programs(api_client):
    """GET /api/staff/programs/ does not return inactive programs."""
    business = make_business("p05")
    staff = make_staff(business)
    login_staff(api_client, staff)

    active_program = make_stamp_program(business, required_count=5)
    inactive_program = make_spend_program(business, required_spend="200.00")
    inactive_program.is_active = False
    inactive_program.save(update_fields=["is_active"])

    response = api_client.get("/api/staff/programs/")

    assert response.status_code == 200
    programs = response.data["data"]["programs"]
    assert len(programs) == 1
    assert programs[0]["id"] == str(active_program.id)
    assert str(inactive_program.id) not in [p["id"] for p in programs]


def test_programs_endpoint_excludes_other_business_programs(api_client):
    """GET /api/staff/programs/ only returns programs for the staff's own business."""
    business_a = make_business("p06")
    business_b = make_business("p07")

    staff_a = make_staff(business_a)
    login_staff(api_client, staff_a)

    program_a = make_stamp_program(business_a, required_count=4)
    _program_b = make_stamp_program(business_b, required_count=4)

    response = api_client.get("/api/staff/programs/")

    assert response.status_code == 200
    programs = response.data["data"]["programs"]
    assert len(programs) == 1
    assert programs[0]["id"] == str(program_a.id)


def test_programs_endpoint_requires_staff_permission(api_client):
    """GET /api/staff/programs/ returns 401/403 for unauthenticated requests."""
    api_client.credentials()  # clear any auth
    response = api_client.get("/api/staff/programs/")
    assert response.status_code in (401, 403)
