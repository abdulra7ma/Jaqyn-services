import pytest
from django.core.cache import cache

from apps.accounts.models import CustomerProfile, User
from apps.accounts.services import otp_key


pytestmark = pytest.mark.django_db


def _clear_resend_cooldown(phone):
    # Tests below intentionally re-request within 60s; drop the per-phone
    # resend cooldown so they exercise the behavior they were written for.
    # The cooldown itself is covered in test_security_hardening.py.
    cache.delete(f"otp-resend:{phone}")


def test_request_and_verify_otp_creates_customer(api_client):
    phone = "+996700123456"

    request_response = api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")
    assert request_response.status_code == 200
    assert request_response.data["success"] is True
    code = cache.get(otp_key(phone))["code"]

    verify_response = api_client.post("/api/auth/verify-otp/", {"phone": phone, "code": code}, format="json")

    assert verify_response.status_code == 200
    assert verify_response.data["data"]["is_new"] is True
    assert verify_response.data["data"]["access"]
    user = User.objects.get(phone=phone)
    assert user.is_phone_verified is True
    assert user.role == User.Role.CUSTOMER
    profile = CustomerProfile.objects.get(user=user)
    assert profile.marketing_opt_in is False


def test_invalid_otp_fails(api_client):
    phone = "+996700123457"
    api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")

    response = api_client.post("/api/auth/verify-otp/", {"phone": phone, "code": "000000"}, format="json")

    assert response.status_code == 400
    assert response.data["success"] is False
    assert response.data["error"]["code"] == "INVALID_OTP"


def test_expired_otp_fails(api_client):
    response = api_client.post("/api/auth/verify-otp/", {"phone": "+996700123458", "code": "123456"}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "OTP_EXPIRED"


def test_resend_overwrites_code_and_returning_user_is_not_new(api_client):
    phone = "+996700123459"
    api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")
    first_code = cache.get(otp_key(phone))["code"]
    _clear_resend_cooldown(phone)
    api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")
    second_code = cache.get(otp_key(phone))["code"]

    assert first_code != second_code
    first_login = api_client.post("/api/auth/verify-otp/", {"phone": phone, "code": second_code}, format="json")
    assert first_login.data["data"]["is_new"] is True

    _clear_resend_cooldown(phone)
    api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")
    next_code = cache.get(otp_key(phone))["code"]
    second_login = api_client.post("/api/auth/verify-otp/", {"phone": phone, "code": next_code}, format="json")

    assert second_login.data["data"]["is_new"] is False


def test_otp_rate_limit_per_phone(api_client, settings):
    settings.OTP_RATE_LIMIT_PER_PHONE = 1
    phone = "+996700123460"

    assert api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json").status_code == 200
    _clear_resend_cooldown(phone)
    response = api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")

    assert response.status_code == 429
    assert response.data["error"]["code"] == "RATE_LIMITED"


def test_profile_and_me(api_client):
    phone = "+996700123461"
    api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")
    code = cache.get(otp_key(phone))["code"]
    login = api_client.post("/api/auth/verify-otp/", {"phone": phone, "code": code}, format="json")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

    profile = api_client.patch(
        "/api/auth/profile/",
        {"name": "Aida", "email": "aida@example.com", "language": "en", "marketing_opt_in": True},
        format="json",
    )
    me = api_client.get("/api/auth/me/")

    assert profile.status_code == 200
    assert profile.data["data"]["user"]["name"] == "Aida"
    assert profile.data["data"]["profile"]["language"] == "en"
    assert me.data["data"]["profile"]["marketing_opt_in"] is True
