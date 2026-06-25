import pytest
from unittest.mock import patch
from django.core.cache import cache

from apps.accounts.models import CustomerProfile, User
from apps.accounts.services import issue_email_otp, issue_otp, otp_key, verify_email_otp, verify_otp


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_phone_signup_new_user_profile_not_completed():
    phone = "+996700111222"
    with patch("apps.accounts.tasks.send_otp.delay"):
        issue_otp(phone, "1.2.3.4")
    code = cache.get(otp_key(phone))["code"]
    user, is_new, _, _ = verify_otp(phone, code)
    assert is_new is True
    assert user.customer_profile.profile_completed is False


@pytest.mark.django_db
def test_email_signup_new_user_profile_completed():
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        issue_email_otp(
            email="e@example.com", name="Eve", password="password123", phone=None, ip_address="1.1.1.1"
        )
    code = cache.get("email_otp:e@example.com")["code"]
    user, is_new, _, _ = verify_email_otp("e@example.com", code)
    assert is_new is True
    assert user.customer_profile.profile_completed is True
