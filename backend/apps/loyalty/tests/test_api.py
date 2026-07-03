from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.campaigns.models import Campaign, CampaignReward, CampaignRewardVoucher
from apps.loyalty.models import (
    LoyaltyMembership,
    LoyaltyProgram,
    LoyaltyTransaction,
    LoyaltyVoucher,
)
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
    assert cards.data["data"]["results"][0]["min_redeem_points"] == 10
    assert str(cards.data["data"]["results"][0]["business_id"]) == str(business.id)


@pytest.mark.django_db
def test_business_program_detail_returns_members_vouchers_analytics(api_actors):
    owner, customer, staff, business = api_actors
    program = LoyaltyProgram.objects.create(
        business=business,
        type=LoyaltyProgram.Type.STAMP,
        name="Stamp card",
        required_count=6,
        reward_type=LoyaltyProgram.RewardType.FREE_ITEM,
        reward_title="1 free coffee",
    )
    membership = LoyaltyMembership.objects.create(
        program=program, customer=customer, stamps_count=3
    )
    # Two earns from the same customer → counts as a repeat member.
    for _ in range(2):
        LoyaltyTransaction.objects.create(
            membership=membership,
            program=program,
            customer=customer,
            business=business,
            kind=LoyaltyTransaction.Kind.EARN,
            stamps_delta=1,
            staff=staff,
        )
    LoyaltyVoucher.objects.create(
        membership=membership,
        program=program,
        customer=customer,
        business=business,
        voucher_code="JQ-1001",
        status=LoyaltyVoucher.Status.ACTIVE,
        reward_type=LoyaltyProgram.RewardType.FREE_ITEM,
        reward_title="1 free coffee",
    )

    client = APIClient()
    client.force_authenticate(owner)
    res = client.get(f"/api/business/loyalty/programs/{program.id}/")
    assert res.status_code == 200
    data = res.data["data"]

    # Transactions are labelled with the customer they affected.
    assert data["transactions"][0]["customer_name"] == "Customer"
    # Reward Usage tab is fed by the voucher list.
    assert data["vouchers"][0]["voucher_code"] == "JQ-1001"
    assert data["vouchers"][0]["customer_name"] == "Customer"
    # Named analytics replace the old stat_a/b/c placeholders.
    a = data["analytics"]
    assert a["members"] == 1
    assert a["outstanding"] == 1  # one active voucher
    assert a["new_members_30d"] == 1
    assert a["repeat_rate"] == 1.0  # the single member earned more than once
    # Analytics tab extras: avg basket + a 7-point redemption trend.
    assert "avg_basket" in a
    assert len(a["redemptions_7d"]) == 7


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
    assert client.get("/api/customer/loyalty/home-summary/").status_code == 401
    client.force_authenticate(customer)
    assert client.get("/api/business/loyalty/programs/").status_code == 403
    client.force_authenticate(owner)
    assert client.get("/api/customer/loyalty/cards/").status_code == 403
    assert client.get("/api/customer/loyalty/home-summary/").status_code == 403


@pytest.mark.django_db
def test_customer_home_summary_returns_consecutive_visit_streak(api_actors):
    _, customer, staff, business = api_actors
    program = LoyaltyProgram.objects.create(
        business=business,
        type=LoyaltyProgram.Type.STAMP,
        name="Stamp card",
        required_count=6,
    )
    membership = LoyaltyMembership.objects.create(program=program, customer=customer)
    LoyaltyVoucher.objects.create(
        membership=membership,
        program=program,
        customer=customer,
        business=business,
        voucher_code="PROFILE-CASHBACK",
        status=LoyaltyVoucher.Status.REDEEMED,
        reward_type=LoyaltyProgram.RewardType.CASHBACK,
        reward_title="Cashback",
        cashback_amount=Decimal("125.00"),
    )
    LoyaltyVoucher.objects.create(
        membership=membership,
        program=program,
        customer=customer,
        business=business,
        voucher_code="PROFILE-ACTIVE",
        status=LoyaltyVoucher.Status.ACTIVE,
        reward_type=LoyaltyProgram.RewardType.FREE_ITEM,
        reward_title="Free coffee",
    )
    campaign = Campaign.objects.create(
        business=business,
        created_by=api_actors[0],
        name="Profile reward campaign",
        campaign_type=Campaign.CampaignType.INDIVIDUAL,
    )
    campaign_reward = CampaignReward.objects.create(
        campaign=campaign,
        reward_type=CampaignReward.RewardType.FREE_ITEM,
        title="Campaign coffee",
        estimated_cost=Decimal("75.00"),
    )
    CampaignRewardVoucher.objects.create(
        campaign=campaign,
        customer=customer,
        business=business,
        reward=campaign_reward,
        voucher_code="PROFILE-CAMPAIGN",
        status=CampaignRewardVoucher.Status.REDEEMED,
    )
    for days_ago in (0, 1, 2, 4):
        transaction = LoyaltyTransaction.objects.create(
            membership=membership,
            program=program,
            customer=customer,
            business=business,
            kind=LoyaltyTransaction.Kind.EARN,
            stamps_delta=1,
            staff=staff,
        )
        LoyaltyTransaction.objects.filter(id=transaction.id).update(
            created_at=timezone.now() - timedelta(days=days_ago)
        )

    client = APIClient()
    client.force_authenticate(customer)
    response = client.get("/api/customer/loyalty/home-summary/")

    assert response.status_code == 200
    assert response.data["data"] == {
        "visit_streak_days": 3,
        "streak_active_today": True,
        "featured_campaign_ids": [],
        "rewards_earned": 3,
        "som_saved": "200.00",
        "active_cards": 1,
    }


# --- B2: unified scan active_vouchers + group token tests ------------------


def _make_loyalty_voucher(
    program, customer, business, voucher_code, reward_title="Free coffee"
):
    """Helper: create a LoyaltyMembership + ACTIVE LoyaltyVoucher."""
    membership, _ = LoyaltyMembership.objects.get_or_create(
        program=program, customer=customer
    )
    return LoyaltyVoucher.objects.create(
        membership=membership,
        program=program,
        customer=customer,
        business=business,
        voucher_code=voucher_code,
        status=LoyaltyVoucher.Status.ACTIVE,
        reward_type=LoyaltyProgram.RewardType.FREE_ITEM,
        reward_title=reward_title,
    )


@pytest.mark.django_db
def test_unified_scan_customer_returns_active_vouchers(api_actors):
    """Scanning a customer QR surfaces their ACTIVE loyalty voucher for this business."""
    _, customer, staff, business = api_actors

    program = LoyaltyProgram.objects.create(
        business=business,
        type=LoyaltyProgram.Type.STAMP,
        name="Stamp card",
        required_count=5,
        reward_title="Free coffee",
    )
    voucher = _make_loyalty_voucher(program, customer, business, "TESTVOUCHER1")
    token = get_or_create_customer_profile_token(customer)
    client = APIClient()
    client.force_authenticate(staff.user)

    response = client.post("/api/staff/scan/", {"token": token.token}, format="json")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["kind"] == "customer"
    assert len(data["active_vouchers"]) == 1
    v = data["active_vouchers"][0]
    assert v["id"] == str(voucher.id)
    assert v["source"] == "loyalty"
    assert v["label"] == "Free coffee"


@pytest.mark.django_db
def test_unified_scan_customer_active_vouchers_empty_when_none(api_actors):
    """active_vouchers is an empty list when the customer holds no vouchers."""
    _, customer, staff, business = api_actors
    token = get_or_create_customer_profile_token(customer)
    client = APIClient()
    client.force_authenticate(staff.user)

    response = client.post("/api/staff/scan/", {"token": token.token}, format="json")

    assert response.status_code == 200
    assert response.data["data"]["active_vouchers"] == []


@pytest.mark.django_db
def test_unified_scan_customer_excludes_other_business_vouchers(api_actors):
    """active_vouchers must not include vouchers from a different business."""
    _, customer, staff, business = api_actors

    other_owner = User.objects.create_user(
        phone="+996700099001", role=User.Role.BUSINESS_OWNER
    )
    other_biz = Business.objects.create(
        owner=other_owner, name="Other Cafe", status=Business.Status.APPROVED
    )
    other_program = LoyaltyProgram.objects.create(
        business=other_biz,
        type=LoyaltyProgram.Type.STAMP,
        name="Other stamps",
        required_count=5,
        reward_title="Other reward",
    )
    _make_loyalty_voucher(
        other_program, customer, other_biz, "OTHERVOUCHER", "Other reward"
    )
    token = get_or_create_customer_profile_token(customer)
    client = APIClient()
    client.force_authenticate(staff.user)

    response = client.post("/api/staff/scan/", {"token": token.token}, format="json")

    assert response.status_code == 200
    assert response.data["data"]["active_vouchers"] == []


@pytest.mark.django_db
def test_redeem_loyalty_voucher_by_id_happy_path(api_actors):
    """Loyalty redeem endpoint accepts voucher_id from scan-customer active_vouchers."""
    _, customer, staff, business = api_actors

    program = LoyaltyProgram.objects.create(
        business=business,
        type=LoyaltyProgram.Type.STAMP,
        name="Stamp card",
        required_count=5,
        reward_title="Free coffee",
    )
    voucher = _make_loyalty_voucher(program, customer, business, "REDEEM001")
    client = APIClient()
    client.force_authenticate(staff.user)

    response = client.post(
        "/api/staff/loyalty/redeem-voucher/",
        {"voucher_id": str(voucher.id)},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["data"]["status"] == LoyaltyVoucher.Status.REDEEMED


@pytest.mark.django_db
def test_redeem_loyalty_voucher_by_id_wrong_business_rejected(api_actors):
    """Redeeming a loyalty voucher_id from another business returns WRONG_BUSINESS."""
    _, customer, staff, business = api_actors

    other_owner = User.objects.create_user(
        phone="+996700099002", role=User.Role.BUSINESS_OWNER
    )
    other_biz = Business.objects.create(
        owner=other_owner, name="Wrong Cafe", status=Business.Status.APPROVED
    )
    other_program = LoyaltyProgram.objects.create(
        business=other_biz,
        type=LoyaltyProgram.Type.STAMP,
        name="Other stamps",
        required_count=5,
        reward_title="Other reward",
    )
    voucher = _make_loyalty_voucher(
        other_program, customer, other_biz, "WRONGBIZ001", "Other reward"
    )
    client = APIClient()
    client.force_authenticate(staff.user)

    response = client.post(
        "/api/staff/loyalty/redeem-voucher/",
        {"voucher_id": str(voucher.id)},
        format="json",
    )
    assert response.status_code in (400, 403)
    assert response.data["error"]["code"] == "WRONG_BUSINESS"


@pytest.mark.django_db
def test_redeem_loyalty_voucher_requires_code_or_id(api_actors):
    """Redeem endpoint returns 400 when neither code nor voucher_id is sent."""
    _, _, staff, _ = api_actors
    client = APIClient()
    client.force_authenticate(staff.user)

    response = client.post("/api/staff/loyalty/redeem-voucher/", {}, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_unified_scan_group_token_returns_group_info():
    """Scanning a GROUP_INVITE token returns kind=group with member + leader info."""
    from datetime import timedelta

    from django.utils import timezone

    from apps.campaigns.models import Campaign, Group, GroupMember
    from apps.campaigns.tests.helpers import (
        make_business,
        make_campaign,
        make_customer,
        make_staff,
    )
    from apps.qr.models import QRCodeToken
    from apps.qr.services import create_token

    business = make_business("g01")
    leader = make_customer("g01")
    member = make_customer("g02")
    staff_user = make_staff(business, suffix="g01")
    campaign = make_campaign(
        business,
        campaign_type=Campaign.CampaignType.GROUP,
        required_group_size=2,
    )

    # Mint a GROUP_INVITE token (mirrors what CampaignGroupService.create_group does).
    qr_token = create_token(
        QRCodeToken.Type.GROUP_INVITE,
        business=business,
        customer=leader,
        campaign=campaign.id,
        expires_at=timezone.now() + timedelta(hours=1),
    )
    group = Group.objects.create(
        campaign=campaign,
        group_leader=leader,
        status=Group.Status.FORMING,
        required_size=2,
        invite_token=qr_token.token,
    )
    GroupMember.objects.create(
        group=group, customer=leader, status=GroupMember.Status.CHECKED_IN
    )
    GroupMember.objects.create(
        group=group, customer=member, status=GroupMember.Status.JOINED
    )

    client = APIClient()
    client.force_authenticate(staff_user.user)

    response = client.post("/api/staff/scan/", {"token": qr_token.token}, format="json")

    assert response.status_code == 200
    data = response.data["data"]
    assert data["kind"] == "group"
    assert data["group_session_id"] == str(group.id)
    assert data["required_size"] == 2
    assert data["leader_name"] == leader.name
    assert len(data["members"]) == 2
    leader_member = next(m for m in data["members"] if m["is_leader"])
    assert leader_member["status"] == GroupMember.Status.CHECKED_IN


@pytest.mark.django_db
def test_unified_scan_excludes_group_campaigns_from_customer_rows():
    """When scanning a customer QR, GROUP campaigns must not appear in campaigns list."""
    from apps.campaigns.models import Campaign
    from apps.campaigns.tests.helpers import (
        make_business,
        make_campaign,
        make_customer,
        make_staff,
    )
    from apps.qr.services import get_or_create_customer_profile_token

    business = make_business("ue01")
    staff_user = make_staff(business, suffix="ue01")
    customer = make_customer("ue01")
    make_campaign(business, required_count=3)  # INDIVIDUAL
    group_campaign = make_campaign(
        business,
        campaign_type=Campaign.CampaignType.GROUP,
        required_group_size=4,
    )
    token = get_or_create_customer_profile_token(customer)

    client = APIClient()
    client.force_authenticate(staff_user.user)
    response = client.post("/api/staff/scan/", {"token": token.token}, format="json")

    assert response.status_code == 200
    data = response.data["data"]
    campaign_ids = [row["campaign_id"] for row in data["campaigns"]]
    assert str(group_campaign.id) not in campaign_ids
