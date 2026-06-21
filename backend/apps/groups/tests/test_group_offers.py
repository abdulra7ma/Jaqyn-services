from datetime import date, timedelta

import pytest

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.groups.models import GroupOffer


pytestmark = pytest.mark.django_db


def make_business(status=Business.Status.APPROVED, suffix="001"):
    owner = User.objects.create_user(phone=f"+996704000{suffix}", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
    business = Business.objects.create(
        owner=owner,
        name="Group Cafe",
        category="cafe",
        address="Ibraimov 10",
        area="center",
        phone=f"+996704100{suffix}",
        working_hours={},
        status=status,
    )
    return business


def offer_payload(**overrides):
    payload = {
        "title": "Friends brunch",
        "description": "Come with friends",
        "category": "cafe",
        "min_group_size": 3,
        "max_group_size": 6,
        "reward_type": "group_discount",
        "reward_description": "20% off",
        "valid_from": date.today().isoformat(),
        "valid_to": (date.today() + timedelta(days=7)).isoformat(),
        "valid_days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        "time_start": "09:00:00",
        "time_end": "21:00:00",
    }
    payload.update(overrides)
    return payload


def test_business_creates_offer_admin_approves_public_visibility(api_client):
    business = make_business()
    api_client.force_authenticate(business.owner)
    created = api_client.post("/api/business/group-offers/", offer_payload(), format="json")
    offer_id = created.data["data"]["id"]
    hidden = api_client.get("/api/group-offers/")
    submitted = api_client.post(f"/api/business/group-offers/{offer_id}/submit-for-approval/")

    admin = User.objects.create_superuser(phone="+996704000003", password="secret")
    api_client.force_authenticate(admin)
    pending = api_client.get("/api/admin/group-offers/pending/")
    approved = api_client.post(f"/api/admin/group-offers/{offer_id}/approve/")
    public = api_client.get("/api/group-offers/")

    assert created.status_code == 201
    assert created.data["data"]["status"] == GroupOffer.Status.DRAFT
    assert hidden.data["data"]["results"] == []
    assert submitted.data["data"]["status"] == GroupOffer.Status.PENDING_APPROVAL
    assert len(pending.data["data"]["results"]) == 1
    assert approved.data["data"]["status"] == GroupOffer.Status.ACTIVE
    assert public.data["data"]["results"][0]["id"] == offer_id


def test_offer_validation_and_business_status_gate(api_client):
    business = make_business()
    api_client.force_authenticate(business.owner)

    bad_size = api_client.post("/api/business/group-offers/", offer_payload(min_group_size=7, max_group_size=3), format="json")
    bad_time = api_client.post("/api/business/group-offers/", offer_payload(time_start="21:00:00", time_end="09:00:00"), format="json")
    inactive = make_business(Business.Status.PENDING, suffix="002")
    api_client.force_authenticate(inactive.owner)
    inactive_response = api_client.post("/api/business/group-offers/", offer_payload(title="Inactive"), format="json")

    assert bad_size.status_code == 400
    assert bad_time.status_code == 400
    assert inactive_response.status_code == 400
    assert inactive_response.data["error"]["code"] == "BUSINESS_NOT_ACTIVE"


def test_status_transition_guards_pause_activate(api_client):
    business = make_business()
    api_client.force_authenticate(business.owner)
    created = api_client.post("/api/business/group-offers/", offer_payload(), format="json")
    offer_id = created.data["data"]["id"]
    pause_draft = api_client.post(f"/api/business/group-offers/{offer_id}/pause/")

    api_client.post(f"/api/business/group-offers/{offer_id}/submit-for-approval/")
    admin = User.objects.create_superuser(phone="+996704000004", password="secret")
    api_client.force_authenticate(admin)
    api_client.post(f"/api/admin/group-offers/{offer_id}/approve/")
    api_client.force_authenticate(business.owner)
    paused = api_client.post(f"/api/business/group-offers/{offer_id}/pause/")
    activated = api_client.post(f"/api/business/group-offers/{offer_id}/activate/")

    assert pause_draft.status_code == 409
    assert paused.data["data"]["status"] == GroupOffer.Status.PAUSED
    assert activated.data["data"]["status"] == GroupOffer.Status.ACTIVE
