"""Tests for owner-created staff accounts and profile_completed flag."""
import pytest
from rest_framework.test import APIClient

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


# --- POST /api/business/staff/ endpoint ---


def _make_owner_client() -> tuple[Business, APIClient]:
    """Build an approved business + an APIClient authenticated as its owner."""
    owner = User.objects.create_user(
        phone="+996709999002",
        role=User.Role.BUSINESS_OWNER,
        is_phone_verified=True,
        name="Owner2",
    )
    business = Business.objects.create(
        owner=owner,
        name="Test Cafe 2",
        category="cafe",
        address="Main 2",
        area="center",
        phone="+996709100002",
        working_hours={},
        status=Business.Status.APPROVED,
    )
    client = APIClient()
    client.force_authenticate(user=owner)
    return business, client


def test_create_staff_endpoint_owner_only_and_returns_password():
    business, client = _make_owner_client()
    resp = client.post(
        "/api/business/staff/",
        {"phone": "+996700333444", "role": "cashier"},
        format="json",
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["temp_password"]
    assert body["member"]["role"] == "cashier"
    # ponytail: _member_status returns "active" for is_active=True members;
    # "invited" is the status for StaffInvite rows only. A freshly created
    # StaffMember (is_active=True) reports "active".
    assert body["member"]["status"] == "active"


def test_create_staff_endpoint_rejects_anonymous():
    resp = APIClient().post(
        "/api/business/staff/",
        {"phone": "+996700333444", "role": "cashier"},
        format="json",
    )
    assert resp.status_code in (401, 403)


# --- Staff profile completion (first-login setup) ---


def test_complete_staff_profile_sets_name_password_and_flag():
    business = _make_business()
    member, temp_password = management.create_staff_account(business, "+996700555666", StaffMember.Role.CASHIER)
    updated = management.complete_staff_profile(member.user, name="Aibek", new_password="newpass12")
    updated.refresh_from_db()
    updated.user.refresh_from_db()
    assert updated.profile_completed is True
    assert updated.name == "Aibek"
    assert updated.user.name == "Aibek"
    assert updated.user.check_password("newpass12")
    assert not updated.user.check_password(temp_password)  # temp password no longer valid
