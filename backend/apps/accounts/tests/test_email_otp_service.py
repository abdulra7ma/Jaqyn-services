import pytest
from unittest.mock import patch
from django.core.cache import cache

from apps.accounts.models import CustomerProfile, User
from apps.accounts.services import issue_email_otp, verify_email_otp
from core.exceptions import JaqynAPIException


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def _issue(email="user@example.com", name="Alice", password="secret123", phone=None, ip="1.2.3.4"):
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        return issue_email_otp(email=email, name=name, password=password, phone=phone, ip_address=ip)


@pytest.mark.django_db
def test_issue_email_otp_stores_payload_in_cache():
    _issue()
    payload = cache.get("email_otp:user@example.com")
    assert payload is not None
    assert payload["name"] == "Alice"
    assert len(payload["code"]) == 6
    assert "password_hash" in payload


@pytest.mark.django_db
def test_issue_email_otp_returns_request_id():
    request_id = _issue()
    assert request_id is not None
    assert len(request_id) == 36  # UUID format


@pytest.mark.django_db
def test_issue_email_otp_rate_limits_by_email(settings):
    # OTP_RATE_LIMIT_PER_PHONE defaults to 5; override to 3 so 3 calls succeed
    # and the 4th is rejected, keeping the test fast and deterministic.
    settings.OTP_RATE_LIMIT_PER_PHONE = 3
    for _ in range(3):
        _issue()
    with pytest.raises(JaqynAPIException) as exc:
        _issue()
    assert exc.value.code == "RATE_LIMITED"


@pytest.mark.django_db
def test_verify_email_otp_creates_user_and_returns_tokens():
    _issue(email="new@example.com", name="Bob", password="pass123", phone="+996700000000")
    payload = cache.get("email_otp:new@example.com")
    user, is_new, access, refresh = verify_email_otp("new@example.com", payload["code"])
    assert is_new is True
    assert user.email == "new@example.com"
    assert user.name == "Bob"
    assert user.phone == "+996700000000"
    assert user.is_email_verified is True
    assert user.role == User.Role.CUSTOMER
    assert CustomerProfile.objects.filter(user=user).exists()
    assert access
    assert refresh


@pytest.mark.django_db
def test_verify_email_otp_password_is_usable():
    _issue(email="pw@example.com", password="mypassword")
    payload = cache.get("email_otp:pw@example.com")
    user, _, _, _ = verify_email_otp("pw@example.com", payload["code"])
    assert user.check_password("mypassword")


@pytest.mark.django_db
def test_verify_email_otp_wrong_code_raises():
    _issue(email="bad@example.com")
    with pytest.raises(JaqynAPIException) as exc:
        verify_email_otp("bad@example.com", "000000")
    assert exc.value.code == "INVALID_OTP"


@pytest.mark.django_db
def test_verify_email_otp_expired_raises():
    with pytest.raises(JaqynAPIException) as exc:
        verify_email_otp("ghost@example.com", "123456")
    assert exc.value.code == "OTP_EXPIRED"


@pytest.mark.django_db
def test_verify_email_otp_clears_cache_on_success():
    _issue(email="clean@example.com")
    payload = cache.get("email_otp:clean@example.com")
    verify_email_otp("clean@example.com", payload["code"])
    assert cache.get("email_otp:clean@example.com") is None


@pytest.mark.django_db
def test_verify_email_otp_existing_user_logs_in_without_overwrite():
    user = User.objects.create(email="existing@example.com", name="Original", role=User.Role.CUSTOMER)
    user.set_password("oldpassword")
    user.save()
    CustomerProfile.objects.create(user=user)

    _issue(email="existing@example.com", name="NewName", password="newpassword")
    payload = cache.get("email_otp:existing@example.com")
    returned_user, is_new, access, refresh = verify_email_otp("existing@example.com", payload["code"])

    assert is_new is False
    assert returned_user.id == user.id
    assert returned_user.is_email_verified is True
    assert returned_user.name == "Original"  # not overwritten
