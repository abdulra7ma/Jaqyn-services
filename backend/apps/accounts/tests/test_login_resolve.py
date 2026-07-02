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
