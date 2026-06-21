from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.qr.models import ApprovalCode, QRCodeToken, ScanLog
from apps.qr.services import current_approval_code, staff_token
from apps.staff.models import StaffMember


pytestmark = pytest.mark.django_db


def make_business(status=Business.Status.APPROVED):
    owner = User.objects.create_user(phone="+996701000001", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
    return Business.objects.create(
        owner=owner,
        name="QR Cafe",
        category="cafe",
        address="Chuy 10",
        area="center",
        phone="+996701000002",
        working_hours={},
        status=status,
    )


def test_business_qr_creates_unguessable_token_and_resolve_logs(api_client):
    business = make_business()
    api_client.force_authenticate(business.owner)

    qr_response = api_client.get("/api/business/qr/")
    token = qr_response.data["data"]["token"]
    resolve_response = api_client.get(f"/api/qr/{token}/")

    assert qr_response.status_code == 200
    assert len(token) >= 22
    assert qr_response.data["data"]["png"].startswith("data:image/png;base64,")
    assert resolve_response.data["data"]["type"] == QRCodeToken.Type.MERCHANT_COLLECT
    assert ScanLog.objects.filter(token_value=token, status=ScanLog.Status.SUCCESS, action="resolve").exists()


def test_invalid_disabled_and_expired_qr_paths_log(api_client):
    business = make_business()
    disabled = QRCodeToken.objects.create(token="disabled-token", type=QRCodeToken.Type.MERCHANT_COLLECT, business=business, is_active=False)
    expired = QRCodeToken.objects.create(
        token="expired-token",
        type=QRCodeToken.Type.MERCHANT_COLLECT,
        business=business,
        expires_at=timezone.now() - timedelta(minutes=1),
    )

    invalid_response = api_client.get("/api/qr/no-such-token/")
    disabled_response = api_client.get(f"/api/qr/{disabled.token}/")
    expired_response = api_client.get(f"/api/qr/{expired.token}/")

    assert invalid_response.status_code == 404
    assert disabled_response.data["error"]["code"] == "INVALID_QR_TOKEN"
    assert expired_response.data["error"]["code"] == "QR_TOKEN_EXPIRED"
    assert ScanLog.objects.filter(status=ScanLog.Status.BLOCKED, failure_reason="QR_TOKEN_EXPIRED").exists()


def test_staff_phone_login_and_today_code(api_client):
    business = make_business()
    staff = StaffMember.objects.create(business=business, name="Aibek", role=StaffMember.Role.CASHIER)

    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {staff_token(staff)}")
    today_code = api_client.get("/api/staff/today-code/")

    staff.refresh_from_db()
    assert staff.user.role == User.Role.STAFF
    assert len(staff.user.phone) <= 32
    assert today_code.status_code == 200
    assert len(today_code.data["data"]["code"]) == 6


def test_approval_code_regenerate_and_customer_validation(api_client):
    business = make_business()
    customer = User.objects.create_user(phone="+996701000003", role=User.Role.CUSTOMER, is_phone_verified=True)
    api_client.force_authenticate(business.owner)
    regenerated = api_client.post("/api/business/approval-code/regenerate/")
    code = regenerated.data["data"]["code"]

    api_client.force_authenticate(customer)
    valid = api_client.post(f"/api/merchant/{business.id}/validate-code/", {"code": code}, format="json")
    invalid = api_client.post(f"/api/merchant/{business.id}/validate-code/", {"code": "000000"}, format="json")

    assert valid.status_code == 200
    assert valid.data["data"]["valid"] is True
    assert invalid.status_code == 400
    assert invalid.data["error"]["code"] == "INVALID_APPROVAL_CODE"
    assert ScanLog.objects.filter(action="validate_code", status=ScanLog.Status.SUCCESS).exists()
    assert ScanLog.objects.filter(action="validate_code", status=ScanLog.Status.FAILED).exists()


def test_current_approval_code_reuses_active_window():
    business = make_business()
    code = current_approval_code(business)
    again = current_approval_code(business)

    assert code.id == again.id
    assert ApprovalCode.objects.filter(business=business, is_active=True).count() == 1
