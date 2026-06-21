import pytest

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption, RewardTransaction
from apps.qr.models import ScanLog
from apps.qr.services import current_approval_code, get_or_create_merchant_collect_token


pytestmark = pytest.mark.django_db


def make_business(status=Business.Status.APPROVED):
    owner = User.objects.create_user(phone="+996702000001", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
    business = Business.objects.create(
        owner=owner,
        name="Stamp Cafe",
        category="cafe",
        address="Manas 20",
        area="center",
        phone="+996702000002",
        working_hours={},
        status=status,
    )
    return business


def reward_payload(required_count=1):
    return {
        "type": "stamp",
        "title": "Free coffee",
        "description": "Collect stamps",
        "required_count": required_count,
        "reward_description": "One free coffee",
        "expiry_days": 14,
    }


def test_business_creates_pauses_and_activates_reward(api_client):
    business = make_business()
    api_client.force_authenticate(business.owner)

    created = api_client.post("/api/business/rewards/", reward_payload(), format="json")
    reward_id = created.data["data"]["id"]
    listed = api_client.get("/api/business/rewards/")
    paused = api_client.post(f"/api/business/rewards/{reward_id}/pause/")
    activated = api_client.post(f"/api/business/rewards/{reward_id}/activate/")

    assert created.status_code == 201
    assert listed.data["data"]["results"][0]["title"] == "Free coffee"
    assert paused.data["data"]["is_active"] is False
    assert activated.data["data"]["is_active"] is True


def test_pending_business_cannot_create_reward(api_client):
    business = make_business(Business.Status.PENDING)
    api_client.force_authenticate(business.owner)

    response = api_client.post("/api/business/rewards/", reward_payload(), format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "BUSINESS_NOT_ACTIVE"


def test_customer_collects_stamp_unlocks_reward_and_dashboard_reflects_scan(api_client):
    business = make_business()
    program = RewardProgram.objects.create(business=business, **reward_payload(required_count=1))
    qr_token = get_or_create_merchant_collect_token(business)
    approval_code = current_approval_code(business)
    customer = User.objects.create_user(phone="+996702000003", role=User.Role.CUSTOMER, is_phone_verified=True)
    api_client.force_authenticate(customer)

    collect = api_client.post(f"/api/qr/{qr_token.token}/collect/", {"approval_code": approval_code.code}, format="json")
    rewards = api_client.get("/api/customer/rewards/")
    progress = CustomerRewardProgress.objects.get(customer=customer, reward_program=program)
    api_client.force_authenticate(business.owner)
    dashboard = api_client.get("/api/business/dashboard/")

    assert collect.status_code == 200
    assert collect.data["data"]["current_count"] == 1
    assert collect.data["data"]["status"] == CustomerRewardProgress.Status.UNLOCKED
    assert rewards.data["data"]["results"][0]["status"] == CustomerRewardProgress.Status.UNLOCKED
    assert RewardTransaction.objects.filter(progress=progress, action=RewardTransaction.Action.EARNED).count() == 1
    assert RewardTransaction.objects.filter(progress=progress, action=RewardTransaction.Action.UNLOCKED).count() == 1
    assert RewardRedemption.objects.filter(progress=progress, status=RewardRedemption.Status.PENDING).count() == 1
    assert ScanLog.objects.filter(action="collect_reward", status=ScanLog.Status.SUCCESS).exists()
    assert dashboard.data["data"]["metrics"]["scans"] >= 1


def test_wrong_approval_code_blocks_collect_and_logs(api_client):
    business = make_business()
    RewardProgram.objects.create(business=business, **reward_payload())
    qr_token = get_or_create_merchant_collect_token(business)
    customer = User.objects.create_user(phone="+996702000004", role=User.Role.CUSTOMER, is_phone_verified=True)
    api_client.force_authenticate(customer)

    response = api_client.post(f"/api/qr/{qr_token.token}/collect/", {"approval_code": "000000"}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "INVALID_APPROVAL_CODE"
    assert ScanLog.objects.filter(action="collect_reward", status=ScanLog.Status.BLOCKED, failure_reason="INVALID_APPROVAL_CODE").exists()


def test_repeat_collect_hits_limit(api_client, settings):
    settings.COLLECT_DAILY_LIMIT = 1
    settings.COLLECT_MIN_INTERVAL_SECONDS = 0
    business = make_business()
    RewardProgram.objects.create(business=business, **reward_payload(required_count=2))
    qr_token = get_or_create_merchant_collect_token(business)
    approval_code = current_approval_code(business)
    customer = User.objects.create_user(phone="+996702000005", role=User.Role.CUSTOMER, is_phone_verified=True)
    api_client.force_authenticate(customer)

    first = api_client.post(f"/api/qr/{qr_token.token}/collect/", {"approval_code": approval_code.code}, format="json")
    second = api_client.post(f"/api/qr/{qr_token.token}/collect/", {"approval_code": approval_code.code}, format="json")

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.data["error"]["code"] == "SCAN_LIMIT_REACHED"
    assert RewardTransaction.objects.filter(customer=customer, action=RewardTransaction.Action.EARNED).count() == 1
