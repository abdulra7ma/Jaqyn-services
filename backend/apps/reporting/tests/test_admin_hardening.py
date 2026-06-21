import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.groups.models import GroupDeal, GroupOffer
from apps.loyalty.models import RewardProgram, RewardTransaction
from apps.qr.models import QRCodeToken, ScanLog
from apps.qr.services import get_or_create_merchant_collect_token
from apps.reporting.models import AdminAuditLog


pytestmark = pytest.mark.django_db


def make_business():
    owner = User.objects.create_user(phone="+996709000001", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
    return Business.objects.create(
        owner=owner,
        name="Hardening Cafe",
        category="cafe",
        address="Admin 1",
        area="center",
        phone="+996709000002",
        working_hours={},
        status=Business.Status.APPROVED,
    )


def make_admin():
    return User.objects.create_superuser(phone="+996709000003", password="secret")


def make_program(business):
    return RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.STAMP,
        title="Adjust",
        description="Desc",
        required_count=5,
        reward_description="Prize",
    )


def make_group(business):
    customer = User.objects.create_user(phone="+996709900001", role=User.Role.CUSTOMER, is_phone_verified=True)
    offer = GroupOffer.objects.create(
        business=business,
        title="Admin group",
        description="Desc",
        category="cafe",
        min_group_size=1,
        reward_description="Reward",
        valid_days=["mon"],
        status=GroupOffer.Status.ACTIVE,
    )
    return GroupDeal.objects.create(group_offer=offer, leader=customer, visit_time=timezone.now(), invite_token="admin-group")


def test_manual_adjustment_and_block_user(api_client):
    business = make_business()
    customer = User.objects.create_user(phone="+996709900002", role=User.Role.CUSTOMER, is_phone_verified=True)
    program = make_program(business)
    admin = make_admin()
    api_client.force_authenticate(admin)

    adjustment = api_client.post(
        "/api/admin/manual-adjustment/",
        {"customer": str(customer.id), "program": str(program.id), "amount_count": 2, "reason": "missed stamp"},
        format="json",
    )
    blocked = api_client.post(f"/api/admin/users/{customer.id}/block/", {"reason": "abuse"}, format="json")

    assert adjustment.status_code == 200
    assert adjustment.data["data"]["current_count"] == 2
    assert RewardTransaction.objects.filter(action=RewardTransaction.Action.ADJUSTED, source=RewardTransaction.Source.ADMIN_ADJUSTMENT).exists()
    assert blocked.data["data"]["is_active"] is False
    assert AdminAuditLog.objects.filter(action="manual_adjustment").exists()
    assert AdminAuditLog.objects.filter(action="block_user").exists()


def test_disable_business_disables_qr_and_disable_token(api_client):
    business = make_business()
    token = get_or_create_merchant_collect_token(business)
    admin = make_admin()
    api_client.force_authenticate(admin)

    disabled_business = api_client.post(f"/api/admin/businesses/{business.id}/disable/", {"reason": "closed"}, format="json")
    token.refresh_from_db()
    other_token = QRCodeToken.objects.create(token="admin-disable-token", type=QRCodeToken.Type.MERCHANT_COLLECT, business=business)
    disabled_token = api_client.post(f"/api/admin/qr-tokens/{other_token.id}/disable/", {"reason": "leaked"}, format="json")

    assert disabled_business.data["data"]["status"] == Business.Status.DISABLED
    assert token.is_active is False
    assert disabled_token.data["data"]["is_active"] is False
    assert AdminAuditLog.objects.filter(action="disable_business").exists()
    assert AdminAuditLog.objects.filter(action="disable_qr_token").exists()


def test_group_remediation_and_suspicious_scans(api_client):
    business = make_business()
    group = make_group(business)
    customer = group.leader
    for _ in range(3):
        ScanLog.objects.create(customer=customer, business=business, action="collect", status=ScanLog.Status.BLOCKED, failure_reason="SCAN_LIMIT_REACHED")
    admin = make_admin()
    api_client.force_authenticate(admin)

    failed = api_client.post(f"/api/admin/groups/{group.id}/fail/", {"reason": "no show"}, format="json")
    completed = api_client.post(f"/api/admin/groups/{group.id}/complete/", {"reason": "manual proof"}, format="json")
    suspicious = api_client.get("/api/admin/scan-logs/")

    assert failed.data["data"]["status"] == GroupDeal.Status.FAILED
    assert completed.data["data"]["status"] == GroupDeal.Status.COMPLETED
    assert suspicious.data["data"]["suspicious"][0]["total"] == 3
    assert AdminAuditLog.objects.filter(action="mark_group_failed").exists()
    assert AdminAuditLog.objects.filter(action="mark_group_completed").exists()
