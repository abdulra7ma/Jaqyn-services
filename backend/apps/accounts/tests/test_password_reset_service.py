import pytest
from unittest.mock import patch
from django.core.cache import cache

from apps.accounts.models import User
from apps.accounts.services import issue_password_reset_otp, reset_password
from core.exceptions import JaqynAPIException


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


def _issue(email="user@example.com", ip="1.2.3.4"):
    # Drop the 60s resend cooldown so these tests can issue repeatedly; the
    # cooldown itself is covered in test_security_hardening.py.
    cache.delete(f"pwreset-resend:{email.lower()}")
    with patch("apps.accounts.tasks.send_password_reset_otp_task.delay") as delay:
        issue_password_reset_otp(email=email, ip_address=ip)
        return delay


@pytest.mark.django_db
def test_issue_stores_code_and_sends_email_for_existing_user():
    _make_user()
    delay = _issue()
    payload = cache.get("pwreset_otp:user@example.com")
    assert payload is not None
    assert len(payload["code"]) == 6
    delay.assert_called_once()


@pytest.mark.django_db
def test_issue_for_unknown_email_returns_without_raising_and_sends_nothing():
    delay = _issue(email="ghost@example.com")
    assert cache.get("pwreset_otp:ghost@example.com") is None
    delay.assert_not_called()


@pytest.mark.django_db
def test_issue_normalizes_email_case():
    _make_user(email="mixed@example.com")
    _issue(email="Mixed@Example.com")
    assert cache.get("pwreset_otp:mixed@example.com") is not None


@pytest.mark.django_db
def test_issue_rate_limits_by_email():
    _make_user()
    # OTP_RATE_LIMIT_PER_PHONE defaults to 5; hit_limit fires when current > limit,
    # so the 6th call (index 5) is the first that raises.
    for _ in range(5):
        _issue()
    with pytest.raises(JaqynAPIException) as exc:
        _issue()
    assert exc.value.code == "RATE_LIMITED"


@pytest.mark.django_db
def test_reset_password_success_sets_password_and_returns_tokens():
    user = _make_user(password="oldpassword")
    _issue()
    code = cache.get("pwreset_otp:user@example.com")["code"]
    returned_user, access, refresh = reset_password("user@example.com", code, "newpassword123")
    assert returned_user.id == user.id
    assert access
    assert refresh
    user.refresh_from_db()
    assert user.check_password("newpassword123")
    assert not user.check_password("oldpassword")


@pytest.mark.django_db
def test_reset_password_clears_cache_on_success():
    _make_user()
    _issue()
    code = cache.get("pwreset_otp:user@example.com")["code"]
    reset_password("user@example.com", code, "newpassword123")
    assert cache.get("pwreset_otp:user@example.com") is None


@pytest.mark.django_db
def test_reset_password_wrong_code_raises_invalid():
    _make_user()
    _issue()
    with pytest.raises(JaqynAPIException) as exc:
        reset_password("user@example.com", "000000", "newpassword123")
    assert exc.value.code == "INVALID_OTP"


@pytest.mark.django_db
def test_reset_password_no_code_issued_raises_expired():
    _make_user()
    with pytest.raises(JaqynAPIException) as exc:
        reset_password("user@example.com", "123456", "newpassword123")
    assert exc.value.code == "OTP_EXPIRED"
