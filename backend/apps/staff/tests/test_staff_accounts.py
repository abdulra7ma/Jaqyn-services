"""Tests for owner-created staff accounts and profile_completed flag."""
import pytest

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.staff.models import StaffMember

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
