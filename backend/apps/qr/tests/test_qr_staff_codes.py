from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.qr.models import QRCodeToken, ScanLog
from apps.qr.services import staff_token
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
    # The first-scan card needs the business icon: resolve exposes logo_url
    # (None when unset) so the frontend can render the real logo, not an initial.
    assert "logo_url" in resolve_response.data["data"]["business"]
    assert resolve_response.data["data"]["business"]["logo_url"] is None
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


def test_staff_phone_login_provisions_user(api_client):
    # Staff log in through the unified session; staff_token provisions the backing
    # User (role=staff, verified phone) so a StaffMember can authenticate.
    business = make_business()
    staff = StaffMember.objects.create(business=business, name="Aibek", role=StaffMember.Role.CASHIER)

    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {staff_token(staff)}")
    programs = api_client.get("/api/staff/programs/")

    staff.refresh_from_db()
    assert staff.user.role == User.Role.STAFF
    assert len(staff.user.phone) <= 32
    assert programs.status_code == 200
