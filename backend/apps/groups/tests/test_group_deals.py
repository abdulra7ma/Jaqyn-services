from datetime import date, datetime, time, timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.groups.models import GroupDeal, GroupMember, GroupOffer
from apps.qr.models import ScanLog
from apps.qr.services import current_approval_code, staff_token
from apps.staff.models import StaffMember


pytestmark = pytest.mark.django_db


def make_business(suffix="001"):
    owner = User.objects.create_user(phone=f"+996705000{suffix}", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
    return Business.objects.create(
        owner=owner,
        name=f"Deal Cafe {suffix}",
        category="cafe",
        address="Kiev 1",
        area="center",
        phone=f"+996705100{suffix}",
        working_hours={},
        status=Business.Status.APPROVED,
    )


def make_offer(business, **overrides):
    today = date.today()
    data = {
        "business": business,
        "title": "Group dessert",
        "description": "Bring friends",
        "category": "cafe",
        "min_group_size": 2,
        "max_group_size": 2,
        "reward_type": GroupOffer.RewardType.FREE_SHARED_ITEM,
        "reward_description": "Dessert",
        "valid_from": today,
        "valid_to": today + timedelta(days=3),
        "valid_days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        "time_start": time(0, 0),
        "time_end": time(23, 59),
        "checkin_window_minutes": 30,
        "status": GroupOffer.Status.ACTIVE,
    }
    data.update(overrides)
    return GroupOffer.objects.create(**data)


def make_customer(suffix):
    return User.objects.create_user(phone=f"+996705900{suffix}", role=User.Role.CUSTOMER, is_phone_verified=True)


def make_staff(business):
    return StaffMember.objects.create(business=business, name="Staff", role=StaffMember.Role.CASHIER)


def login_staff(api_client, business):
    api_client.force_authenticate(user=None)
    staff = business.staff_members.first()
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {staff_token(staff)}")


def visit_time(minutes=10):
    return timezone.now() + timedelta(minutes=minutes)


def test_group_create_join_full_duplicate_and_invite(api_client):
    business = make_business()
    offer = make_offer(business)
    leader = make_customer("001")
    joiner = make_customer("002")
    extra = make_customer("003")
    api_client.force_authenticate(leader)

    created = api_client.post("/api/groups/", {"group_offer": str(offer.id), "visit_time": visit_time().isoformat()}, format="json")
    group_id = created.data["data"]["id"]
    invite = api_client.get(f"/api/groups/{created.data['data']['invite_token']}/")
    api_client.force_authenticate(joiner)
    joined = api_client.post(f"/api/groups/{group_id}/join/")
    duplicate = api_client.post(f"/api/groups/{group_id}/join/")
    api_client.force_authenticate(extra)
    full = api_client.post(f"/api/groups/{group_id}/join/")

    assert created.status_code == 201
    assert invite.data["data"]["id"] == group_id
    assert joined.data["data"]["status"] == GroupDeal.Status.SCHEDULED
    assert duplicate.status_code == 409
    assert full.status_code == 409
    assert full.data["error"]["code"] == "GROUP_FULL"


def test_group_create_rejects_invalid_visit_time(api_client):
    business = make_business()
    offer = make_offer(business, valid_days=["mon"])
    customer = make_customer("004")
    api_client.force_authenticate(customer)
    bad_visit = timezone.make_aware(datetime.combine(date.today() + timedelta(days=1), time(12, 0)))

    response = api_client.post("/api/groups/", {"group_offer": str(offer.id), "visit_time": bad_visit.isoformat()}, format="json")

    if bad_visit.strftime("%a").lower()[:3] == "mon":
        pytest.skip("Generated date happened to be Monday")
    assert response.status_code == 400
    assert response.data["error"]["code"] == "GROUP_NOT_ACTIVE"


def test_checkin_non_member_closed_window_and_completion(api_client):
    business = make_business()
    offer = make_offer(business)
    code = current_approval_code(business)
    leader = make_customer("005")
    joiner = make_customer("006")
    stranger = make_customer("007")
    api_client.force_authenticate(leader)
    created = api_client.post("/api/groups/", {"group_offer": str(offer.id), "visit_time": visit_time().isoformat()}, format="json")
    group_id = created.data["data"]["id"]
    api_client.force_authenticate(joiner)
    api_client.post(f"/api/groups/{group_id}/join/")

    api_client.force_authenticate(stranger)
    non_member = api_client.post(f"/api/groups/{group_id}/check-in/", {"approval_code": code.code}, format="json")
    deal = GroupDeal.objects.get(id=group_id)
    deal.visit_time = timezone.now() + timedelta(hours=2)
    deal.save(update_fields=["visit_time"])
    api_client.force_authenticate(leader)
    closed = api_client.post(f"/api/groups/{group_id}/check-in/", {"approval_code": code.code}, format="json")
    deal.visit_time = timezone.now() + timedelta(minutes=5)
    deal.save(update_fields=["visit_time"])
    leader_checkin = api_client.post(f"/api/groups/{group_id}/check-in/", {"approval_code": code.code}, format="json")
    api_client.force_authenticate(joiner)
    complete = api_client.post(f"/api/groups/{group_id}/check-in/", {"approval_code": code.code}, format="json")

    assert non_member.status_code == 403
    assert non_member.data["error"]["code"] == "NOT_GROUP_MEMBER"
    assert closed.status_code == 400
    assert closed.data["error"]["code"] == "GROUP_CHECKIN_CLOSED"
    assert leader_checkin.status_code == 200
    assert complete.data["data"]["status"] == GroupDeal.Status.COMPLETED
    assert complete.data["data"]["reward_code"]
    assert GroupMember.objects.filter(group_deal_id=group_id, status=GroupMember.Status.CHECKED_IN).count() == 2


def test_staff_group_redeem_once_and_wrong_business(api_client):
    business = make_business()
    other = make_business("002")
    offer = make_offer(business)
    code = current_approval_code(business)
    leader = make_customer("008")
    joiner = make_customer("009")
    api_client.force_authenticate(leader)
    created = api_client.post("/api/groups/", {"group_offer": str(offer.id), "visit_time": visit_time().isoformat()}, format="json")
    group_id = created.data["data"]["id"]
    api_client.force_authenticate(joiner)
    api_client.post(f"/api/groups/{group_id}/join/")
    api_client.force_authenticate(leader)
    api_client.post(f"/api/groups/{group_id}/check-in/", {"approval_code": code.code}, format="json")
    api_client.force_authenticate(joiner)
    api_client.post(f"/api/groups/{group_id}/check-in/", {"approval_code": code.code}, format="json")

    make_staff(other)
    login_staff(api_client, other)
    wrong = api_client.post(f"/api/staff/groups/{group_id}/redeem/")
    make_staff(business)
    login_staff(api_client, business)
    redeemed = api_client.post(f"/api/staff/groups/{group_id}/redeem/")
    second = api_client.post(f"/api/staff/groups/{group_id}/redeem/")

    assert wrong.status_code == 403
    assert wrong.data["error"]["code"] == "WRONG_BUSINESS"
    assert redeemed.status_code == 200
    assert redeemed.data["data"]["redeemed_at"]
    assert second.status_code == 409
    assert second.data["error"]["code"] == "REWARD_ALREADY_REDEEMED"
    assert ScanLog.objects.filter(action="group_redeem", status=ScanLog.Status.SUCCESS).exists()
