from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.loyalty.models import LoyaltyMembership, LoyaltyProgram
from apps.qr.services import get_or_create_customer_profile_token
from apps.staff.models import StaffMember


@pytest.fixture
def api_actors():
    owner = User.objects.create_user(
        phone="+996700001201", role=User.Role.BUSINESS_OWNER
    )
    customer = User.objects.create_user(
        phone="+996700001202", role=User.Role.CUSTOMER, name="Customer"
    )
    staff_user = User.objects.create_user(phone="+996700001203", role=User.Role.STAFF)
    business = Business.objects.create(
        owner=owner, name="API Cafe", status=Business.Status.APPROVED
    )
    staff = StaffMember.objects.create(
        user=staff_user, business=business, name="Cashier"
    )
    return owner, customer, staff, business


@pytest.mark.django_db
def test_owner_create_and_customer_cards(api_actors):
    owner, customer, _, business = api_actors
    client = APIClient()
    client.force_authenticate(owner)
    response = client.post(
        "/api/business/loyalty/programs/",
        {
            "type": "points",
            "name": "Five back",
            "points_basis": "spend",
            "points_per_som": "0.05",
            "cashback_per_point": "1.00",
            "min_redeem_points": 10,
        },
        format="json",
    )
    assert response.status_code == 201
    program = LoyaltyProgram.objects.get(id=response.data["data"]["id"])
    programs = client.get("/api/business/loyalty/programs/")
    assert programs.status_code == 200
    assert programs.data["data"]["results"][0]["members"] == 0
    assert programs.data["data"]["results"][0]["outstanding"] == 0
    LoyaltyMembership.objects.create(
        program=program, customer=customer, points_balance=25
    )
    client.force_authenticate(customer)
    cards = client.get("/api/customer/loyalty/cards/")
    assert cards.status_code == 200
    assert cards.data["data"]["results"][0]["points_balance"] == 25
    assert str(cards.data["data"]["results"][0]["business_id"]) == str(business.id)


@pytest.mark.django_db
def test_unified_scan_and_staff_award(api_actors):
    _, customer, staff, business = api_actors
    program = LoyaltyProgram.objects.create(
        business=business,
        type=LoyaltyProgram.Type.POINTS,
        name="Five back",
        points_basis=LoyaltyProgram.PointsBasis.SPEND,
        points_per_som=Decimal("0.05"),
        cashback_per_point=Decimal("1"),
        min_redeem_points=10,
    )
    token = get_or_create_customer_profile_token(customer)
    client = APIClient()
    client.force_authenticate(staff.user)
    scan = client.post("/api/staff/scan/", {"token": token.token}, format="json")
    assert scan.status_code == 200
    assert scan.data["data"]["loyalty"][0]["needs_amount"] is True
    award = client.post(
        "/api/staff/loyalty/award/",
        {"token": token.token, "program_id": str(program.id), "amount": "1000"},
        format="json",
    )
    assert award.status_code == 200
    assert award.data["data"]["points_balance"] == 50


@pytest.mark.django_db
def test_loyalty_endpoints_enforce_roles(api_actors):
    owner, customer, _, _ = api_actors
    client = APIClient()
    assert client.get("/api/customer/loyalty/cards/").status_code == 401
    client.force_authenticate(customer)
    assert client.get("/api/business/loyalty/programs/").status_code == 403
    client.force_authenticate(owner)
    assert client.get("/api/customer/loyalty/cards/").status_code == 403
