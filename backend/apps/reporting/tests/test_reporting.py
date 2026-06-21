import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.groups.models import GroupDeal, GroupMember, GroupOffer
from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption
from apps.qr.models import ScanLog


pytestmark = pytest.mark.django_db


def make_business():
    owner = User.objects.create_user(phone="+996707000001", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
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
    customer = User.objects.create_user(phone="+996707999123", role=User.Role.CUSTOMER, is_phone_verified=True, name="Customer")
    program = RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.STAMP,
        title="Reward",
        description="Desc",
        required_count=1,
        reward_description="Prize",
    )
    progress = CustomerRewardProgress.objects.create(customer=customer, business=business, reward_program=program, current_count=1, target_count=1)
    RewardRedemption.objects.create(customer=customer, business=business, reward_program=program, progress=progress, code="ABCDEFGH", status=RewardRedemption.Status.REDEEMED)
    ScanLog.objects.create(customer=customer, business=business, action="collect", status=ScanLog.Status.SUCCESS)
    ScanLog.objects.create(customer=customer, business=business, action="redeem", status=ScanLog.Status.SUCCESS)
    offer = GroupOffer.objects.create(
        business=business,
        title="Group",
        description="Desc",
        category="cafe",
        min_group_size=1,
        reward_description="Group reward",
        valid_days=["mon"],
        status=GroupOffer.Status.ACTIVE,
    )
    deal = GroupDeal.objects.create(group_offer=offer, leader=customer, visit_time=timezone.now(), invite_token="invite", status=GroupDeal.Status.COMPLETED)
    GroupMember.objects.create(group_deal=deal, customer=customer, status=GroupMember.Status.CHECKED_IN)
    return customer


def test_business_reports_and_masked_customers(api_client):
    business = make_business()
    customer = seed_metrics(business)
    api_client.force_authenticate(business.owner)

    reports = api_client.get("/api/business/reports/")
    customers = api_client.get("/api/business/customers/")
    dashboard = api_client.get("/api/business/dashboard/")

    assert reports.status_code == 200
    assert reports.data["data"]["total_scans"] == 2
    assert reports.data["data"]["rewards_redeemed"] == 1
    assert reports.data["data"]["completed_groups"] == 1
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
