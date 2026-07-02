import pytest
from apps.accounts.models import User

pytestmark = pytest.mark.django_db


def test_resolve_email_is_password():
    r = __import__("apps.accounts.services", fromlist=["resolve_login_method"]).resolve_login_method(
        "owner@test.local", None
    )
    assert r["method"] == "password"


def test_resolve_phone_with_password_is_password():
    User.objects.create_user(phone="+996700777888", password="pw12345678", role=User.Role.STAFF)
    from apps.accounts.services import resolve_login_method
    assert resolve_login_method("+996700777888", None)["method"] == "password"


def test_resolve_phone_without_password_sends_otp():
    from apps.accounts.services import resolve_login_method
    r = resolve_login_method("+996700999000", None)  # unknown phone → otp signup path
    assert r["method"] == "otp"
    assert r["request_id"]


def test_password_login_by_phone(client):
    from apps.accounts.models import User
    User.objects.create_user(phone="+996700222333", password="pw12345678", role=User.Role.STAFF)
    resp = client.post(
        "/api/auth/login-password/", {"identifier": "+996700222333", "password": "pw12345678"},
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["access"]


def test_me_includes_staff_profile_completed(client):
    from apps.accounts.models import User
    from apps.businesses.models import Business
    from apps.staff.models import StaffMember
    from apps.staff.services import management
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    # Build a business owned by a separate owner user.
    owner = User.objects.create_user(
        phone="+996709988001", role=User.Role.BUSINESS_OWNER, is_phone_verified=True, name="Owner"
    )
    biz = Business.objects.create(
        owner=owner,
        name="Ponytail Cafe",
        category="cafe",
        address="Main 1",
        area="center",
        phone="+996709988002",
        working_hours={},
        status=Business.Status.APPROVED,
    )
    member, temp_password = management.create_staff_account(biz, "+996700887766", StaffMember.Role.CASHIER)
    staff_user = member.user

    # (a) /api/auth/me/ returns profile_completed=False in the staff dict.
    api = APIClient()
    token = str(RefreshToken.for_user(staff_user).access_token)
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    resp = api.get("/api/auth/me/")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["staff"]["profile_completed"] is False

    # (b) password-login _auth_payload for a staff-area user returns profile_completed=False.
    resp2 = client.post(
        "/api/auth/login-password/",
        {"identifier": "+996700887766", "password": temp_password},
        content_type="application/json",
    )
    assert resp2.status_code == 200
    assert resp2.json()["data"]["profile_completed"] is False
