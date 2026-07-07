import pytest
from unittest.mock import patch
from django.core.cache import cache
from rest_framework.test import APIClient

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
def test_email_signup_new_user_profile_not_completed():
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        issue_email_otp("e@example.com", "1.1.1.1")
    code = cache.get("email_otp:e@example.com")["code"]
    user, is_new, _, _ = verify_email_otp("e@example.com", code)
    assert is_new is True
    assert user.customer_profile.profile_completed is False


@pytest.mark.django_db
def test_auth_payload_includes_profile_completed():
    with patch("apps.accounts.tasks.send_email_otp_task.delay"):
        issue_email_otp("p@example.com", "1.1.1.1")
    code = cache.get("email_otp:p@example.com")["code"]
    client = APIClient()
    res = client.post("/api/auth/verify-email-otp/", {"email": "p@example.com", "code": code}, format="json")
    assert res.status_code == 200
    assert res.json()["data"]["profile_completed"] is False


@pytest.mark.django_db
def test_profile_patch_with_name_sets_profile_completed():
    user = User.objects.create(phone="+996700333444", role=User.Role.CUSTOMER)
    CustomerProfile.objects.create(user=user, profile_completed=False)
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.patch("/api/auth/profile/", {"name": "Sam"}, format="json")
    assert res.status_code == 200
    user.customer_profile.refresh_from_db()
    assert user.customer_profile.profile_completed is True
    assert res.json()["data"]["profile"]["profile_completed"] is True


@pytest.mark.django_db
def test_profile_patch_rejects_future_birthday():
    user = User.objects.create(phone="+996700333555", role=User.Role.CUSTOMER)
    CustomerProfile.objects.create(user=user)
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.patch("/api/auth/profile/", {"birthday": "2999-01-01"}, format="json")
    assert res.status_code == 400
    assert "birthday" in res.json()["error"]["details"]


@pytest.mark.django_db
def test_profile_patch_rejects_prehistoric_birthday():
    user = User.objects.create(phone="+996700333666", role=User.Role.CUSTOMER)
    CustomerProfile.objects.create(user=user)
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.patch("/api/auth/profile/", {"birthday": "1899-12-31"}, format="json")
    assert res.status_code == 400
    assert "birthday" in res.json()["error"]["details"]


@pytest.mark.django_db
def test_profile_patch_accepts_valid_birthday():
    user = User.objects.create(phone="+996700333777", role=User.Role.CUSTOMER)
    CustomerProfile.objects.create(user=user)
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.patch("/api/auth/profile/", {"birthday": "1995-06-15"}, format="json")
    assert res.status_code == 200
    user.customer_profile.refresh_from_db()
    assert str(user.customer_profile.birthday) == "1995-06-15"


@pytest.mark.django_db
def test_profile_patch_sets_phone():
    user = User.objects.create(email="noph@example.com", role=User.Role.CUSTOMER)
    CustomerProfile.objects.create(user=user)
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.patch("/api/auth/profile/", {"name": "Noph", "phone": "+996700888999"}, format="json")
    assert res.status_code == 200
    user.refresh_from_db()
    assert user.phone == "+996700888999"


@pytest.mark.django_db
def test_profile_patch_phone_conflict_returns_409():
    User.objects.create(phone="+996700888999", role=User.Role.CUSTOMER)
    user = User.objects.create(email="taken@example.com", role=User.Role.CUSTOMER)
    CustomerProfile.objects.create(user=user)
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.patch("/api/auth/profile/", {"phone": "+996700888999"}, format="json")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "PHONE_TAKEN"


@pytest.mark.django_db
def test_me_includes_profile_completed():
    user = User.objects.create(phone="+996700555666", role=User.Role.CUSTOMER)
    CustomerProfile.objects.create(user=user, profile_completed=False)
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.get("/api/auth/me/")
    assert res.status_code == 200
    assert res.json()["data"]["profile"]["profile_completed"] is False
