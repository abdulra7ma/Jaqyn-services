from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption
from apps.loyalty.services import create_redemption
from apps.qr.models import QRCodeToken, ScanLog
from apps.qr.services import staff_token
from apps.staff.models import StaffMember


pytestmark = pytest.mark.django_db


def make_business(phone_suffix="001"):
    owner = User.objects.create_user(phone=f"+996703000{phone_suffix}", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
    return Business.objects.create(
        owner=owner,
        name=f"Redeem Cafe {phone_suffix}",
        category="cafe",
        address="Toktogul 1",
        area="center",
        phone=f"+996703100{phone_suffix}",
        working_hours={},
        status=Business.Status.APPROVED,
    )


def make_unlocked_progress(business):
    customer = User.objects.create_user(phone="+996703999001", role=User.Role.CUSTOMER, is_phone_verified=True)
    program = RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.STAMP,
        title="Coffee",
        description="Collect",
        required_count=1,
        reward_description="Free coffee",
        expiry_days=7,
    )
    return CustomerRewardProgress.objects.create(
        customer=customer,
        business=business,
        reward_program=program,
        current_count=1,
        target_count=1,
        status=CustomerRewardProgress.Status.UNLOCKED,
        unlocked_at=timezone.now(),
    )


def make_staff(business):
    return StaffMember.objects.create(business=business, name="Cashier", role=StaffMember.Role.CASHIER)


def login_staff(api_client, business):
    api_client.force_authenticate(user=None)
    staff = business.staff_members.first()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {staff_token(staff)}")


def test_customer_generates_redemption_code_and_staff_redeems_manual_code(api_client):
    """
    Banking-rewards spec: redeeming a voucher no longer flips progress to REDEEMED.
    Progress stays ACTIVE so the customer can continue earning on the same card.
    """
    business = make_business()
    progress = make_unlocked_progress(business)
    make_staff(business)
    api_client.force_authenticate(progress.customer)

    generated = api_client.post(f"/api/customer/rewards/{progress.id}/generate-redemption-code/")
    code = generated.data["data"]["code"]
    login_staff(api_client, business)
    redeemed = api_client.post("/api/staff/redeem/manual-code/", {"code": code}, format="json")
    api_client.force_authenticate(progress.customer)
    detail = api_client.get(f"/api/customer/rewards/{progress.id}/")

    assert generated.status_code == 200
    assert len(code) == 8
    assert redeemed.status_code == 200
    assert redeemed.data["data"]["status"] == RewardRedemption.Status.REDEEMED
    # Banking-rewards: progress stays ACTIVE after redeem (no longer flips to REDEEMED)
    assert detail.data["data"]["status"] == CustomerRewardProgress.Status.UNLOCKED  # unchanged legacy value
    assert ScanLog.objects.filter(action="redeem_reward", status=ScanLog.Status.SUCCESS).exists()


def test_staff_cannot_redeem_twice(api_client):
    business = make_business()
    progress = make_unlocked_progress(business)
    redemption = create_redemption(progress)
    make_staff(business)
    login_staff(api_client, business)

    first = api_client.post("/api/staff/redeem/", {"code": redemption.code}, format="json")
    second = api_client.post("/api/staff/redeem/", {"code": redemption.code}, format="json")

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.data["error"]["code"] == "REWARD_ALREADY_REDEEMED"


def test_wrong_business_redeem_blocked(api_client):
    business = make_business("101")
    other = make_business("102")
    redemption = create_redemption(make_unlocked_progress(business))
    make_staff(other)
    login_staff(api_client, other)

    response = api_client.post("/api/staff/redeem/", {"code": redemption.code}, format="json")

    assert response.status_code == 403
    assert response.data["error"]["code"] == "WRONG_BUSINESS"


def test_expired_redemption_blocked_and_marks_progress(api_client):
    business = make_business()
    progress = make_unlocked_progress(business)
    redemption = create_redemption(progress)
    redemption.expires_at = timezone.now() - timedelta(minutes=1)
    redemption.save(update_fields=["expires_at"])
    make_staff(business)
    login_staff(api_client, business)

    response = api_client.post("/api/staff/redeem/", {"code": redemption.code}, format="json")

    progress.refresh_from_db()
    assert response.status_code == 400
    assert response.data["error"]["code"] == "REWARD_EXPIRED"
    assert progress.status == CustomerRewardProgress.Status.EXPIRED


def test_staff_redeems_by_qr_token(api_client):
    business = make_business()
    progress = make_unlocked_progress(business)
    redemption = create_redemption(progress)
    qr_token = QRCodeToken.objects.get(reward_redemption=redemption)
    make_staff(business)
    login_staff(api_client, business)

    response = api_client.post(f"/api/qr/{qr_token.token}/redeem/")

    assert response.status_code == 200
    assert response.data["data"]["status"] == RewardRedemption.Status.REDEEMED
