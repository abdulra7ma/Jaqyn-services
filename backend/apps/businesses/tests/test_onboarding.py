import pytest

from apps.accounts.models import User
from apps.businesses.models import Business, BusinessType, CatalogItem
from apps.businesses.onboarding_services import generate_owner_invite

pytestmark = pytest.mark.django_db


def make_type(key="cafe", module="menu"):
    return BusinessType.objects.create(key=key, name=key.title(), module=module, sort_order=10)


def draft_business(name="Manas Coffee"):
    return Business.objects.create(name=name, category="cafe", onboarding_status=Business.OnboardingStatus.NOT_STARTED)


# ---- business types ----


def test_business_types_endpoint_lists_active(api_client):
    make_type("cafe", "menu")
    make_type("salon", "services")
    res = api_client.get("/api/business-types/")
    assert res.status_code == 200
    keys = {t["key"] for t in res.data["data"]["results"]}
    assert {"cafe", "salon"} <= keys


# ---- owner invite activation ----


def test_validate_and_activate_owner_invite(api_client):
    business = draft_business()
    invite, raw = generate_owner_invite(business, email="owner@manas.kg")

    validate = api_client.get(f"/api/business/invites/validate/?token={raw}")
    assert validate.status_code == 200
    assert validate.data["data"]["business_name"] == "Manas Coffee"

    activate = api_client.post(
        "/api/business/invites/activate/",
        {"token": raw, "full_name": "Nurlan A.", "password": "secret123"},
        format="json",
    )
    assert activate.status_code == 200
    assert activate.data["data"]["business_id"] == str(business.id)
    assert activate.data["data"]["access"]

    business.refresh_from_db()
    assert business.owner is not None
    assert business.owner.role == User.Role.BUSINESS_OWNER
    assert business.onboarding_status == Business.OnboardingStatus.IN_PROGRESS

    # single-use: second activation rejected
    again = api_client.post(
        "/api/business/invites/activate/",
        {"token": raw, "full_name": "X", "password": "secret123"},
        format="json",
    )
    assert again.status_code == 409


def test_invalid_token_is_404(api_client):
    res = api_client.get("/api/business/invites/validate/?token=nope")
    assert res.status_code == 404


# ---- onboarding state + submit ----


def activated_owner(api_client, business):
    invite, raw = generate_owner_invite(business, email="owner@manas.kg")
    api_client.post(
        "/api/business/invites/activate/",
        {"token": raw, "full_name": "Owner", "password": "secret123"},
        format="json",
    )
    business.refresh_from_db()
    api_client.force_authenticate(business.owner)
    return business


def test_onboarding_patch_autosaves_profile(api_client):
    business = activated_owner(api_client, draft_business())
    res = api_client.patch(
        "/api/business/onboarding/",
        {"display_name": "Manas Coffee", "phone": "+996555120880", "business_type": "cafe"},
        format="json",
    )
    assert res.status_code == 200
    business.refresh_from_db()
    assert business.name == "Manas Coffee"
    assert business.business_type == "cafe"
    assert "completion_score" in res.data["data"]


def test_submit_blocked_until_required_complete(api_client):
    make_type("cafe", "menu")
    business = activated_owner(api_client, draft_business())

    blocked = api_client.post("/api/business/onboarding/submit/")
    assert blocked.status_code == 400

    api_client.patch(
        "/api/business/onboarding/",
        {
            "display_name": "Manas Coffee",
            "description": "Cozy roastery",
            "phone": "+996555120880",
            "address": "Chuy 142",
            "business_type": "cafe",
            "logo_set": True,
        },
        format="json",
    )
    api_client.post(
        "/api/business/catalog-items/",
        {"name": "Cappuccino", "category": "Coffee", "price": "150 c", "module": "menu"},
        format="json",
    )

    ok = api_client.post("/api/business/onboarding/submit/")
    assert ok.status_code == 200
    business.refresh_from_db()
    assert business.onboarding_status == Business.OnboardingStatus.SUBMITTED
    assert business.verification_status == Business.VerificationStatus.PENDING


def test_catalog_item_crud_scoped(api_client):
    business = activated_owner(api_client, draft_business())
    created = api_client.post(
        "/api/business/catalog-items/",
        {"name": "Latte", "category": "Coffee", "price": "170 c", "module": "menu"},
        format="json",
    )
    assert created.status_code == 201
    item_id = created.data["data"]["id"]

    listed = api_client.get("/api/business/catalog-items/")
    assert len(listed.data["data"]["results"]) == 1

    deleted = api_client.delete(f"/api/business/catalog-items/{item_id}/")
    assert deleted.status_code == 200
    assert CatalogItem.objects.filter(id=item_id).count() == 0


def test_staff_invite_limit_enforced(api_client):
    business = activated_owner(api_client, draft_business())
    for i in range(5):
        res = api_client.post(
            "/api/business/staff-invites/",
            {"full_name": f"Staff {i}", "contact": f"s{i}@x.kg", "role": "staff"},
            format="json",
        )
        assert res.status_code == 201

    sixth = api_client.post(
        "/api/business/staff-invites/",
        {"full_name": "Too many", "contact": "extra@x.kg", "role": "staff"},
        format="json",
    )
    assert sixth.status_code == 409


# ---- admin verification ----


def test_admin_verifies_and_publishes(api_client):
    make_type("cafe", "menu")
    business = activated_owner(api_client, draft_business())
    api_client.patch(
        "/api/business/onboarding/",
        {"display_name": "Manas Coffee", "description": "d", "phone": "+996", "address": "a", "business_type": "cafe", "logo_set": True},
        format="json",
    )
    api_client.post("/api/business/catalog-items/", {"name": "X", "price": "1 c", "module": "menu"}, format="json")
    api_client.post("/api/business/onboarding/submit/")

    admin = User.objects.create_superuser(phone="+996700999000", password="secret")
    api_client.force_authenticate(admin)
    verify = api_client.post(f"/api/admin/business-verifications/{business.id}/verify/", {"publish": True}, format="json")
    assert verify.status_code == 200

    business.refresh_from_db()
    assert business.verification_status == Business.VerificationStatus.VERIFIED
    assert business.visibility_status == Business.VisibilityStatus.PUBLISHED
    assert business.status == Business.Status.APPROVED
