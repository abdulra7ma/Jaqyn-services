import pytest
from unittest.mock import patch
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def _make_user(email="user@example.com", password="oldpassword"):
    user = User.objects.create(email=email, name="Alice", role=User.Role.CUSTOMER)
    user.set_password(password)
    user.save()
    return user


@pytest.mark.django_db
def test_request_reset_known_email_returns_200(client):
    _make_user()
    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay"):
        res = client.post("/api/auth/request-password-reset/", {"email": "user@example.com"}, format="json")
    assert res.status_code == 200


@pytest.mark.django_db
def test_request_reset_unknown_email_same_response_no_enumeration(client):
    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay") as delay:
        res = client.post("/api/auth/request-password-reset/", {"email": "ghost@example.com"}, format="json")
    assert res.status_code == 200
    delay.assert_not_called()
    assert cache.get("pwreset_otp:ghost@example.com") is None


@pytest.mark.django_db
def test_request_reset_no_auth_required(client):
    res = client.post("/api/auth/request-password-reset/", {"email": "anon@example.com"}, format="json")
    assert res.status_code == 200


@pytest.mark.django_db
def test_reset_password_success_returns_jwt(client):
    _make_user(password="oldpassword")
    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay"):
        client.post("/api/auth/request-password-reset/", {"email": "user@example.com"}, format="json")
    code = cache.get("pwreset_otp:user@example.com")["code"]
    res = client.post(
        "/api/auth/reset-password/",
        {"email": "user@example.com", "code": code, "new_password": "newpassword123"},
        format="json",
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert "access" in data
    assert "refresh" in data
    assert data["user"]["email"] == "user@example.com"


@pytest.mark.django_db
def test_reset_password_wrong_code_returns_400(client):
    _make_user()
    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay"):
        client.post("/api/auth/request-password-reset/", {"email": "user@example.com"}, format="json")
    res = client.post(
        "/api/auth/reset-password/",
        {"email": "user@example.com", "code": "000000", "new_password": "newpassword123"},
        format="json",
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_OTP"


@pytest.mark.django_db
def test_reset_password_short_password_returns_400(client):
    res = client.post(
        "/api/auth/reset-password/",
        {"email": "user@example.com", "code": "123456", "new_password": "short"},
        format="json",
    )
    assert res.status_code == 400
