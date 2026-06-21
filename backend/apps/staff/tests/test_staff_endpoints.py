import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.loyalty.models import CustomerRewardProgress, RewardProgram
from apps.loyalty.services import create_redemption
from apps.qr.models import ScanLog
from apps.qr.services import get_or_create_merchant_collect_token, staff_token
from apps.staff.models import StaffMember


pytestmark = pytest.mark.django_db


def make_business(suffix="001"):
    owner = User.objects.create_user(phone=f"+996706000{suffix}", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
    return Business.objects.create(
        owner=owner,
        name=f"Staff Cafe {suffix}",
        category="cafe",
        address="Staff 1",
        area="center",
        phone=f"+996706100{suffix}",
        working_hours={},
        status=Business.Status.APPROVED,
    )


def make_staff(business, role=StaffMember.Role.CASHIER):
    return StaffMember.objects.create(business=business, name="Scanner", role=role)


def login_staff(api_client, business):
    staff = business.staff_members.first()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {staff_token(staff)}")


def make_redemption(business):
    customer = User.objects.create_user(phone="+996706900001", role=User.Role.CUSTOMER, is_phone_verified=True)
    program = RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.STAMP,
        title="Reward",
        description="Desc",
        required_count=1,
        reward_description="Prize",
    )
    progress = CustomerRewardProgress.objects.create(
        customer=customer,
        business=business,
        reward_program=program,
        current_count=1,
        target_count=1,
        status=CustomerRewardProgress.Status.UNLOCKED,
        unlocked_at=timezone.now(),
    )
    return create_redemption(progress)


def test_staff_scan_resolves_own_business_reward_token(api_client):
    business = make_business()
    make_staff(business)
    redemption = make_redemption(business)
    token = redemption.qr_tokens.get().token
    login_staff(api_client, business)

    response = api_client.post("/api/staff/scan/", {"token": token}, format="json")

    assert response.status_code == 200
    assert response.data["data"]["type"] == "reward_redeem"
    assert response.data["data"]["redemption"]["code"] == redemption.code


def test_staff_scan_blocks_cross_business_token(api_client):
    business = make_business("001")
    other = make_business("002")
    make_staff(other)
    token = get_or_create_merchant_collect_token(business)
    login_staff(api_client, other)

    response = api_client.post("/api/staff/scan/", {"token": token.token}, format="json")

    assert response.status_code == 403
    assert response.data["error"]["code"] == "WRONG_BUSINESS"


def test_recent_activity_lists_scans_and_redemptions_for_staff_business(api_client):
    business = make_business()
    make_staff(business, role=StaffMember.Role.MANAGER)
    redemption = make_redemption(business)
    ScanLog.objects.create(business=business, action="redeem_reward", status=ScanLog.Status.SUCCESS)
    login_staff(api_client, business)

    response = api_client.get("/api/staff/recent-activity/")

    assert response.status_code == 200
    assert response.data["data"]["scans"][0]["action"] == "redeem_reward"
    assert response.data["data"]["redemptions"][0]["code"] == redemption.code
