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


def _request_otp(client, email="test@example.com", name="Test User", password="password123"):
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        return client.post(
            "/api/auth/request-email-otp/",
            {"email": email, "name": name, "password": password},
            format="json",
        )


@pytest.mark.django_db
def test_request_email_otp_returns_200_and_request_id(client):
    res = _request_otp(client)
    assert res.status_code == 200
    data = res.json()["data"]
    assert "request_id" in data
    assert "expires_in" in data


@pytest.mark.django_db
def test_request_email_otp_missing_name_returns_400(client):
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        res = client.post(
            "/api/auth/request-email-otp/",
            {"email": "test@example.com", "password": "password123"},
            format="json",
        )
    assert res.status_code == 400


@pytest.mark.django_db
def test_request_email_otp_short_password_returns_400(client):
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        res = client.post(
            "/api/auth/request-email-otp/",
            {"email": "test@example.com", "name": "Test", "password": "short"},
            format="json",
        )
    assert res.status_code == 400


@pytest.mark.django_db
def test_request_email_otp_no_auth_required(client):
    res = _request_otp(client, email="anon@example.com")
    assert res.status_code == 200


@pytest.mark.django_db
def test_verify_email_otp_creates_user_returns_jwt(client):
    _request_otp(client, email="new@example.com", name="New User")
    payload = cache.get("email_otp:new@example.com")
    res = client.post(
        "/api/auth/verify-email-otp/",
        {"email": "new@example.com", "code": payload["code"]},
        format="json",
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert "access" in data
    assert "refresh" in data
    assert data["is_new"] is True
    assert data["user"]["email"] == "new@example.com"
    assert data["user"]["is_email_verified"] is True
    assert User.objects.filter(email="new@example.com").exists()


@pytest.mark.django_db
def test_verify_email_otp_wrong_code_returns_400(client):
    _request_otp(client, email="bad@example.com")
    res = client.post(
        "/api/auth/verify-email-otp/",
        {"email": "bad@example.com", "code": "000000"},
        format="json",
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "INVALID_OTP"


@pytest.mark.django_db
def test_verify_email_otp_no_otp_issued_returns_400(client):
    res = client.post(
        "/api/auth/verify-email-otp/",
        {"email": "ghost@example.com", "code": "123456"},
        format="json",
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "OTP_EXPIRED"
