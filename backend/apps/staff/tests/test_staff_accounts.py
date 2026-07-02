"""Tests for owner-created staff accounts and profile_completed flag."""
import pytest

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.staff.models import StaffMember
from apps.staff.services import management

pytestmark = pytest.mark.django_db


def _make_business() -> Business:
    owner = User.objects.create_user(
        phone="+996709999001",
        role=User.Role.BUSINESS_OWNER,
        is_phone_verified=True,
        name="Owner",
    )
    return Business.objects.create(
        owner=owner,
        name="Test Cafe",
        category="cafe",
        address="Main 1",
        area="center",
        phone="+996709100001",
        working_hours={},
        status=Business.Status.APPROVED,
    )


def test_staff_member_defaults_profile_incomplete():
    biz = _make_business()
    member = StaffMember.objects.create(business=biz, name="A", role=StaffMember.Role.CASHIER)
    assert member.profile_completed is False


def test_create_staff_account_creates_user_and_member():
    business = _make_business()
    member, password = management.create_staff_account(business, "+996700111222", StaffMember.Role.CASHIER)
    assert member.profile_completed is False
    assert member.is_active is True
    assert member.user is not None
    assert member.user.role == User.Role.STAFF
    assert member.user.check_password(password)  # returned plaintext matches the hash
    assert len(password) >= 16


def test_create_staff_account_conflict_on_existing_membership():
    business = _make_business()
    management.create_staff_account(business, "+996700111222", StaffMember.Role.CASHIER)
    with pytest.raises(Exception) as exc:
        management.create_staff_account(business, "+996700111222", StaffMember.Role.MANAGER)
    # ponytail: .code is the canonical field; str() renders only the message
    assert "CONFLICT" in repr(exc.value)
