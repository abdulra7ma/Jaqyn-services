import pytest
from unittest.mock import patch
from rest_framework.test import APIClient

from apps.accounts.models import User


@pytest.fixture
def client():
    return APIClient()


def _mock_verify(claims):
    return patch("apps.accounts.services.google_id_token.verify_oauth2_token", return_value=claims)


@pytest.mark.django_db
def test_google_auth_no_auth_required_and_creates_user(client):
    with _mock_verify({"email": "new@example.com", "email_verified": True}):
        res = client.post("/api/auth/google/", {"id_token": "fake-id-token"}, format="json")
    assert res.status_code == 200
    data = res.json()["data"]
    assert "access" in data
    assert "refresh" in data
    assert data["is_new"] is True
    assert data["user"]["email"] == "new@example.com"
    assert data["user"]["is_email_verified"] is True
    assert User.objects.filter(email="new@example.com").exists()


@pytest.mark.django_db
def test_google_auth_missing_id_token_returns_400(client):
    res = client.post("/api/auth/google/", {}, format="json")
    assert res.status_code == 400


@pytest.mark.django_db
def test_google_auth_invalid_token_returns_401(client):
    with patch(
        "apps.accounts.services.google_id_token.verify_oauth2_token",
        side_effect=ValueError("bad token"),
    ):
        res = client.post("/api/auth/google/", {"id_token": "garbage"}, format="json")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "GOOGLE_TOKEN_INVALID"


@pytest.mark.django_db
def test_google_auth_existing_user_logs_in(client):
    user = User.objects.create(email="existing@example.com", name="Original", role=User.Role.CUSTOMER)
    user.set_password("oldpassword")
    user.save()

    with _mock_verify({"email": "existing@example.com", "email_verified": True}):
        res = client.post("/api/auth/google/", {"id_token": "fake-id-token"}, format="json")

    assert res.status_code == 200
    data = res.json()["data"]
    assert data["is_new"] is False
    assert data["user"]["name"] == "Original"
