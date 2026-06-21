import pytest
from django.core.management import call_command

from apps.accounts.models import User
from apps.accounts.services import authenticate_password, resolve_area, verify_otp
from apps.businesses.models import Business
from apps.staff.models import StaffMember

pytestmark = pytest.mark.django_db


def test_dev_login_otp_accepts_static_code_without_cache(settings):
    settings.DEV_LOGIN_OTP = "000000"
    phone = "+996700000001"

    user, created, access, refresh = verify_otp(phone, "000000")

    assert created is True
    assert user.phone == phone
    assert user.role == User.Role.CUSTOMER
    assert access and refresh


def test_dev_login_otp_rejects_other_codes(settings):
    settings.DEV_LOGIN_OTP = "000000"
    # No cached OTP and code != DEV_LOGIN_OTP → falls through to the real path → expired.
    from core.exceptions import JaqynAPIException

    with pytest.raises(JaqynAPIException):
        verify_otp("+996700000002", "999999")


def test_dev_login_otp_disabled_when_unset(settings):
    settings.DEV_LOGIN_OTP = ""
    from core.exceptions import JaqynAPIException

    with pytest.raises(JaqynAPIException):
        verify_otp("+996700000003", "000000")


def test_seed_command_idempotent_and_unified_login(settings):
    settings.SEED_TEST_BUSINESS_CODE = "TESTCAFE"
    settings.SEED_TEST_PASSWORD = "password"

    call_command("seed_test_users", clients=2)
    call_command("seed_test_users", clients=2)  # second run must not duplicate

    assert User.objects.filter(phone__in=["+996700000001", "+996700000002"]).count() == 2
    assert StaffMember.objects.filter(name="Test Cashier").count() == 1

    biz = Business.objects.get(business_code="TESTCAFE")
    assert biz.status == Business.Status.APPROVED

    # Owner routes to business, staff to staff, client to customer.
    owner = User.objects.get(phone="+996700000900")
    staff_user = StaffMember.objects.get(name="Test Cashier").user
    client = User.objects.get(phone="+996700000001")
    assert resolve_area(owner) == "business"
    assert resolve_area(staff_user) == "staff"
    assert resolve_area(client) == "customer"

    # Email + password fallback works for every seeded account.
    for email, expected in [
        ("owner@test.local", "business"),
        ("staff@test.local", "staff"),
        ("client1@test.local", "customer"),
    ]:
        user, access, refresh = authenticate_password(email, "password")
        assert access and refresh
        assert resolve_area(user) == expected


def test_password_login_rejects_bad_credentials():
    from core.exceptions import JaqynAPIException

    User.objects.create_user(phone="+996700000111", email="x@test.local", password="right", role=User.Role.CUSTOMER)
    with pytest.raises(JaqynAPIException):
        authenticate_password("x@test.local", "wrong")
    with pytest.raises(JaqynAPIException):
        authenticate_password("missing@test.local", "right")
