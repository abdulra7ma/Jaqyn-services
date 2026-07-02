"""Tests for owner-as-staff: an owner can hold a staff seat for their own shop.

Covers ensure_owner_staff (create/idempotent/toggle), resolve_areas (multi-area),
the owner-staff toggle endpoint, and that a seated owner passes the staff role
gate while a seatless owner is rejected by get_staff_for_user.
"""

import pytest

from apps.accounts.models import User
from apps.accounts.services import resolve_area, resolve_areas
from apps.businesses.models import Business
from apps.staff.models import StaffMember
from apps.staff.services.management import ensure_owner_staff, get_staff_for_user
from core.exceptions import JaqynAPIException

pytestmark = pytest.mark.django_db


def make_owner_business(suffix="001"):
    owner = User.objects.create_user(
        phone=f"+996709700{suffix}",
        role=User.Role.BUSINESS_OWNER,
        is_phone_verified=True,
        name=f"Owner {suffix}",
    )
    biz = Business.objects.create(
        owner=owner, name=f"Cafe {suffix}", category="cafe", status=Business.Status.APPROVED
    )
    return owner, biz


def test_ensure_owner_staff_creates_manager_seat():
    owner, biz = make_owner_business()
    seat = ensure_owner_staff(biz)
    assert seat is not None
    assert seat.user_id == owner.id
    assert seat.role == StaffMember.Role.MANAGER
    assert seat.is_active is True
    assert seat.pin_hash in (None, "")  # owner uses JWT, not the device PIN flow


def test_ensure_owner_staff_is_idempotent_and_toggles():
    _, biz = make_owner_business()
    first = ensure_owner_staff(biz)
    again = ensure_owner_staff(biz)
    assert first.id == again.id  # reused, not duplicated
    assert StaffMember.objects.filter(business=biz).count() == 1

    off = ensure_owner_staff(biz, active=False)
    assert off.id == first.id
    off.refresh_from_db()
    assert off.is_active is False

    on = ensure_owner_staff(biz, active=True)
    on.refresh_from_db()
    assert on.is_active is True


def test_ensure_owner_staff_noop_without_owner():
    biz = Business.objects.create(name="Ownerless", category="cafe")
    assert ensure_owner_staff(biz) is None
    assert StaffMember.objects.filter(business=biz).count() == 0


def test_resolve_areas_multi_for_owner_with_seat():
    owner, biz = make_owner_business()
    # No seat yet: business only, landing area is business.
    assert resolve_areas(owner) == ["business"]
    assert resolve_area(owner) == "business"

    ensure_owner_staff(biz)
    assert resolve_areas(owner) == ["business", "staff"]
    # Landing stays business — switching to staff is explicit.
    assert resolve_area(owner) == "business"


def test_get_staff_for_user_gates_on_active_seat():
    owner, biz = make_owner_business()
    # Seatless owner: rejected by the service even though the role gate would pass.
    with pytest.raises(JaqynAPIException):
        get_staff_for_user(owner)

    ensure_owner_staff(biz)
    seat = get_staff_for_user(owner)
    assert seat.business_id == biz.id

    ensure_owner_staff(biz, active=False)
    with pytest.raises(JaqynAPIException):
        get_staff_for_user(owner)


def test_toggle_endpoint_enables_and_disables(api_client):
    owner, _ = make_owner_business()
    api_client.force_authenticate(owner)

    on = api_client.post("/api/business/owner-staff/", {"enabled": True}, format="json")
    assert on.status_code == 200
    assert on.json()["data"]["owner_is_staff"] is True

    off = api_client.post("/api/business/owner-staff/", {"enabled": False}, format="json")
    assert off.status_code == 200
    assert off.json()["data"]["owner_is_staff"] is False


def test_seated_owner_passes_staff_endpoint_seatless_owner_403(api_client):
    owner, biz = make_owner_business()
    api_client.force_authenticate(owner)

    # Seatless owner hits the (now owner-inclusive) role gate but is rejected by
    # get_staff_for_user → 403.
    assert api_client.get("/api/staff/stats/").status_code == 403

    ensure_owner_staff(biz)
    assert api_client.get("/api/staff/stats/").status_code == 200
