from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignReward,
    CampaignRewardVoucher,
    CampaignRule,
    Group,
    GroupMember,
)
from apps.qr.models import ScanLog
from apps.staff.models import StaffMember


pytestmark = pytest.mark.django_db


def make_business():
    owner = User.objects.create_user(
        phone="+996707000001", role=User.Role.BUSINESS_OWNER, is_phone_verified=True
    )
    return Business.objects.create(
        owner=owner,
        name="Reports Cafe",
        category="cafe",
        address="Report 1",
        area="center",
        phone="+996707000002",
        working_hours={},
        status=Business.Status.APPROVED,
    )


def seed_metrics(business):
    customer = User.objects.create_user(
        phone="+996707999123",
        role=User.Role.CUSTOMER,
        is_phone_verified=True,
        name="Customer",
    )
    campaign = Campaign.objects.create(
        business=business,
        name="Reward",
        campaign_type=Campaign.CampaignType.INDIVIDUAL,
        status=Campaign.Status.ACTIVE,
    )
    reward = CampaignReward.objects.create(
        campaign=campaign,
        reward_type=CampaignReward.RewardType.FREE_ITEM,
        title="Prize",
    )
    CampaignRewardVoucher.objects.create(
        customer=customer,
        business=business,
        campaign=campaign,
        reward=reward,
        voucher_code="ABCDEFGH",
        status=CampaignRewardVoucher.Status.REDEEMED,
    )
    ScanLog.objects.create(
        customer=customer,
        business=business,
        action="collect",
        status=ScanLog.Status.SUCCESS,
    )
    ScanLog.objects.create(
        customer=customer,
        business=business,
        action="redeem",
        status=ScanLog.Status.SUCCESS,
    )
    group_campaign = Campaign.objects.create(
        business=business,
        name="Group",
        campaign_type=Campaign.CampaignType.GROUP,
        status=Campaign.Status.ACTIVE,
    )
    group = Group.objects.create(
        campaign=group_campaign,
        group_leader=customer,
        required_size=1,
        invite_token="invite",
        status=Group.Status.COMPLETED,
    )
    GroupMember.objects.create(
        group=group, customer=customer, status=GroupMember.Status.CHECKED_IN
    )
    return customer


def test_business_reports_and_masked_customers(api_client):
    business = make_business()
    customer = seed_metrics(business)
    api_client.force_authenticate(business.owner)

    reports = api_client.get("/api/business/reports/")
    customers = api_client.get("/api/business/customers/")
    dashboard = api_client.get("/api/business/dashboard/")

    assert reports.status_code == 200
    data = reports.data["data"]
    assert data["period"] == "month"
    assert [k["key"] for k in data["kpis"]] == [
        "repeat_purchase_rate",
        "avg_visit_frequency",
        "reward_redemption_rate",
        "est_customer_value",
        "avg_spend_per_visit",
        "enrollment_rate",
    ]
    # One customer, both scans same day → one visit; the one redemption is claimed.
    redemption_kpi = next(
        k for k in data["kpis"] if k["key"] == "reward_redemption_rate"
    )
    assert redemption_kpi["value"] == "100%"
    # No spend recorded → spend KPIs render as "—".
    assert (
        next(k for k in data["kpis"] if k["key"] == "avg_spend_per_visit")["value"]
        == "—"
    )
    assert len(data["scans_over_time"]) >= 1
    assert {c["label"] for c in data["cohorts"]} == {
        "New (0–1 visits)",
        "Returning (2–4)",
        "Loyal (5+)",
    }
    assert customers.data["data"]["results"][0]["phone"] == "+99670***123"
    assert customers.data["data"]["results"][0]["id"] == str(customer.id)
    assert dashboard.data["data"]["metrics"]["total_scans"] == 2


def test_admin_metrics(api_client):
    business = make_business()
    seed_metrics(business)
    admin = User.objects.create_superuser(phone="+996707000003", password="secret")
    api_client.force_authenticate(admin)

    response = api_client.get("/api/admin/metrics/")

    assert response.status_code == 200
    assert response.data["data"]["total_businesses"] == 1
    assert response.data["data"]["active_businesses"] == 1
    assert response.data["data"]["total_redemptions"] == 1
    assert response.data["data"]["active_offers"] == 1


def _scan_at(business, customer, when, *, staff=None, action="collect"):
    """Create a success scan and force ``created_at`` (auto_now_add ignores it on create)."""
    scan = ScanLog.objects.create(
        customer=customer,
        business=business,
        staff=staff,
        action=action,
        status=ScanLog.Status.SUCCESS,
    )
    ScanLog.objects.filter(id=scan.id).update(created_at=when)
    return scan


def test_business_reports_requires_auth(api_client):
    business = make_business()
    seed_metrics(business)
    assert api_client.get("/api/business/reports/").status_code == 401


def test_business_reports_forbidden_for_other_role(api_client):
    business = make_business()
    seed_metrics(business)
    customer = User.objects.create_user(
        phone="+996707000044", role=User.Role.CUSTOMER, is_phone_verified=True
    )
    api_client.force_authenticate(customer)
    assert api_client.get("/api/business/reports/").status_code == 403


def test_report_staff_and_spend(api_client):
    business = make_business()
    from apps.loyalty.models import LoyaltyMembership, LoyaltyProgram

    program = LoyaltyProgram.objects.create(
        business=business,
        name="R",
        type=LoyaltyProgram.Type.POINTS,
        points_basis=LoyaltyProgram.PointsBasis.SPEND,
        points_per_som=Decimal("0.05"),
        cashback_per_point=Decimal("1"),
    )
    staff = StaffMember.objects.create(
        business=business, name="Aigerim", role=StaffMember.Role.CASHIER
    )
    now = timezone.localtime()
    # Two customers, first scan handled by `staff` → two sign-ups; one returns a 2nd day.
    c1 = User.objects.create_user(
        phone="+996707111001",
        role=User.Role.CUSTOMER,
        is_phone_verified=True,
        name="C1",
    )
    c2 = User.objects.create_user(
        phone="+996707111002",
        role=User.Role.CUSTOMER,
        is_phone_verified=True,
        name="C2",
    )
    _scan_at(business, c1, now - timedelta(days=2), staff=staff)
    _scan_at(
        business, c1, now - timedelta(days=1), staff=staff
    )  # 2nd visit-day → returning
    _scan_at(business, c2, now - timedelta(days=1), staff=staff)
    LoyaltyMembership.objects.create(
        customer=c1, program=program, current_spend=Decimal("200")
    )

    api_client.force_authenticate(business.owner)
    data = api_client.get("/api/business/reports/").data["data"]

    staff_rows = data["staff"]
    assert len(staff_rows) == 1
    row = staff_rows[0]
    assert row["scans"] == 3
    assert row["signups"] == 2  # both customers' first scan handled by this staff
    assert row["top"] is True
    assert data["team_totals"]["scans"] == 3
    # Spend recorded → avg spend / visit is numeric, not "—".
    assert (
        next(k for k in data["kpis"] if k["key"] == "avg_spend_per_visit")["value"]
        != "—"
    )
    # c1 has two visit-days, c2 one → one repeat customer of two.
    assert (
        next(k for k in data["kpis"] if k["key"] == "repeat_purchase_rate")["value"]
        == "50%"
    )


def test_report_custom_range_validation(api_client):
    business = make_business()
    seed_metrics(business)
    api_client.force_authenticate(business.owner)
    # custom period with reversed range → 400.
    resp = api_client.get(
        "/api/business/reports/?period=custom&date_from=2026-06-30&date_to=2026-06-01"
    )
    assert resp.status_code == 400
