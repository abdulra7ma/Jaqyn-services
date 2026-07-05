import pytest
from unittest.mock import patch
from google.auth.exceptions import GoogleAuthError

from apps.accounts.models import CustomerProfile, User
from apps.accounts.services import authenticate_google
from core.exceptions import JaqynAPIException


def _claims(email="user@example.com", email_verified=True):
    return {"email": email, "email_verified": email_verified}


def _mock_verify(claims):
    return patch("apps.accounts.services.google_id_token.verify_oauth2_token", return_value=claims)


@pytest.mark.django_db
def test_authenticate_google_creates_user_and_returns_tokens():
    with _mock_verify(_claims(email="new@example.com")):
        user, is_new, access, refresh = authenticate_google("fake-id-token")
    assert is_new is True
    assert user.email == "new@example.com"
    assert user.is_email_verified is True
    assert user.role == User.Role.CUSTOMER
    assert user.has_usable_password() is False
    assert user.is_google_account is True
    assert CustomerProfile.objects.filter(user=user).exists()
    assert access
    assert refresh


@pytest.mark.django_db
def test_authenticate_google_existing_user_logs_in_without_overwrite():
    user = User.objects.create(email="existing@example.com", name="Original", role=User.Role.CUSTOMER)
    user.set_password("oldpassword")
    user.save()
    CustomerProfile.objects.create(user=user)

    with _mock_verify(_claims(email="existing@example.com")):
        returned_user, is_new, _, _ = authenticate_google("fake-id-token")

    assert is_new is False
    assert returned_user.id == user.id
    assert returned_user.is_email_verified is True
    assert returned_user.name == "Original"  # not overwritten
    assert returned_user.has_usable_password() is True  # existing password untouched
    assert returned_user.is_google_account is False  # pre-existing account, not flagged


@pytest.mark.django_db
def test_authenticate_google_invalid_token_raises():
    with patch(
        "apps.accounts.services.google_id_token.verify_oauth2_token",
        side_effect=ValueError("bad token"),
    ):
        with pytest.raises(JaqynAPIException) as exc:
            authenticate_google("garbage")
    assert exc.value.code == "GOOGLE_TOKEN_INVALID"


@pytest.mark.django_db
def test_authenticate_google_auth_error_raises():
    with patch(
        "apps.accounts.services.google_id_token.verify_oauth2_token",
        side_effect=GoogleAuthError("network error"),
    ):
        with pytest.raises(JaqynAPIException) as exc:
            authenticate_google("garbage")
    assert exc.value.code == "GOOGLE_TOKEN_INVALID"


@pytest.mark.django_db
def test_authenticate_google_unverified_email_raises():
    with _mock_verify(_claims(email="unverified@example.com", email_verified=False)):
        with pytest.raises(JaqynAPIException) as exc:
            authenticate_google("fake-id-token")
    assert exc.value.code == "GOOGLE_EMAIL_UNVERIFIED"
    assert not User.objects.filter(email="unverified@example.com").exists()


@pytest.mark.django_db
def test_authenticate_google_normalizes_email_case():
    with _mock_verify(_claims(email="Mixed@Example.com")):
        user, is_new, _, _ = authenticate_google("fake-id-token")
    assert is_new is True
    assert user.email == "mixed@example.com"
