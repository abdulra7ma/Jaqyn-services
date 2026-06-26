import pytest

from apps.accounts.models import User
from apps.businesses.models import Business, CatalogItem
from apps.groups.models import GroupOffer
from apps.loyalty.models import RewardProgram


pytestmark = pytest.mark.django_db


def business_payload(name="Cafe Nomad"):
    return {
        "name": name,
        "category": "cafe",
        "description": "Coffee and rewards",
        "address": "Chuy 100",
        "area": "center",
        "phone": "+996700222333",
        "working_hours": {"mon": ["09:00", "21:00"]},
    }


def test_owner_registers_pending_business_and_is_promoted(api_client):
    owner = User.objects.create_user(phone="+996700111222", role=User.Role.CUSTOMER, is_phone_verified=True)
    api_client.force_authenticate(owner)

    response = api_client.post("/api/business/register/", business_payload(), format="json")

    owner.refresh_from_db()
    assert response.status_code == 201
    assert response.data["data"]["status"] == Business.Status.PENDING
    assert owner.role == User.Role.BUSINESS_OWNER
    assert Business.objects.get(owner=owner).name == "Cafe Nomad"


def test_owner_business_endpoints_are_scoped(api_client):
    owner = User.objects.create_user(phone="+996700111223", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
    Business.objects.create(owner=owner, **business_payload())
    other = User.objects.create_user(phone="+996700111224", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
    Business.objects.create(owner=other, **business_payload("Other Cafe"))

    api_client.force_authenticate(owner)
    me = api_client.get("/api/business/me/")
    patch = api_client.patch("/api/business/me/", {"description": "Updated"}, format="json")
    dashboard = api_client.get("/api/business/dashboard/")

    assert me.data["data"]["name"] == "Cafe Nomad"
    assert patch.data["data"]["description"] == "Updated"
    assert dashboard.data["data"]["metrics"]["scans"] == 0
    assert dashboard.data["data"]["metrics"]["customers"] == 0
    assert dashboard.data["data"]["metrics"]["rewards"] == 0
    assert dashboard.data["data"]["metrics"]["total_scans"] == 0


def test_owner_profile_update_persists_public_profile_fields(api_client):
    owner = User.objects.create_user(phone="+996700111320", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
    Business.objects.create(owner=owner, **business_payload())
    api_client.force_authenticate(owner)

    patch = api_client.patch(
        "/api/business/me/",
        {
            "glyph": "M",
            "accent_color": "#5E8B6A",
            "price_level": "ccc",
            "tags": ["Specialty coffee", "Wi-Fi"],
            "website_url": "https://manas.example",
            "latitude": "42.874600",
            "longitude": "74.569800",
        },
        format="json",
    )

    assert patch.status_code == 200
    data = patch.data["data"]
    assert data["glyph"] == "M"
    assert data["accent_color"] == "#5E8B6A"
    assert data["price_level"] == "ccc"
    assert data["tags"] == ["Specialty coffee", "Wi-Fi"]
    assert data["completion_score"] >= 0
    assert "missing_required_fields" in data


def test_public_nearby_filters_visibility_search_category_and_distance(api_client):
    near = Business.objects.create(
        **business_payload("Manas Coffee"),
        status=Business.Status.APPROVED,
        visibility_status=Business.VisibilityStatus.PUBLISHED,
        latitude="42.874600",
        longitude="74.569800",
        glyph="M",
        accent_color="#C25E3C",
        price_level="cc",
        tags=["Coffee"],
    )
    far_payload = business_payload("Far Bakery")
    far_payload["category"] = "bakery"
    Business.objects.create(
        **far_payload,
        status=Business.Status.APPROVED,
        visibility_status=Business.VisibilityStatus.PUBLISHED,
        latitude="42.810000",
        longitude="74.650000",
    )
    Business.objects.create(
        **business_payload("Draft Cafe"),
        status=Business.Status.APPROVED,
        visibility_status=Business.VisibilityStatus.DRAFT,
        latitude="42.874500",
        longitude="74.569700",
    )

    res = api_client.get("/api/businesses/nearby/?search=coffee&category=cafe&lat=42.8745&lng=74.5697&radius_km=5")

    assert res.status_code == 200
    results = res.data["data"]["results"]
    assert [b["name"] for b in results] == ["Manas Coffee"]
    assert results[0]["id"] == str(near.id)
    assert results[0]["distance_km"] is not None
    assert results[0]["glyph"] == "M"
    assert results[0]["tags"] == ["Coffee"]


def test_public_nearby_caches_db_work_and_busts_on_change(api_client, django_assert_num_queries):
    """The discovery list serializes from the DB once per filter combo, then serves
    from cache (zero queries) until a business change busts it."""
    from django.core.cache import cache
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    from apps.businesses.discovery import public_business_payload

    cache.clear()
    Business.objects.create(
        **business_payload("Manas Coffee"),
        status=Business.Status.APPROVED,
        visibility_status=Business.VisibilityStatus.PUBLISHED,
        latitude="42.874600",
        longitude="74.569800",
    )

    # First call serializes from the DB; second is a pure cache hit (no queries).
    first = public_business_payload(search="", category="", area="")
    with django_assert_num_queries(0):
        second = public_business_payload(search="", category="", area="")
    assert [b["name"] for b in first] == [b["name"] for b in second] == ["Manas Coffee"]
    # Cached rows are origin-independent: distance is injected per request, not here.
    assert second[0]["distance_km"] is None
    assert second[0]["latitude"] is not None

    # Saving a business busts the cache, so the next call hits the DB again.
    biz = Business.objects.get(name="Manas Coffee")
    biz.name = "Manas Coffee Roastery"
    biz.save()
    with CaptureQueriesContext(connection) as ctx:
        refreshed = public_business_payload(search="", category="", area="")
    assert len(ctx) > 0  # cache was busted → it had to re-serialize from the DB
    assert refreshed[0]["name"] == "Manas Coffee Roastery"


def test_public_categories_only_returns_categories_with_active_businesses(api_client):
    """The category filter offers only categories that have a discoverable business,
    so a customer never taps a chip that returns nothing."""
    from django.core.cache import cache

    cache.clear()

    def mk(name, category, *, status=Business.Status.APPROVED, vis=Business.VisibilityStatus.PUBLISHED):
        payload = business_payload(name)
        payload["category"] = category
        Business.objects.create(**payload, status=status, visibility_status=vis)

    mk("Pub Cafe", "cafe")
    mk("Pub Barber", "barber")
    mk("Draft Bakery", "bakery", vis=Business.VisibilityStatus.DRAFT)  # not published → excluded
    mk("Pending Beauty", "beauty", status=Business.Status.PENDING)  # not approved → excluded

    res = api_client.get("/api/businesses/categories/")
    assert res.status_code == 200
    values = [c["value"] for c in res.data["data"]["results"]]
    # Only the two with an approved+published business, in Business.Category order.
    assert values == ["cafe", "barber"]


def test_public_business_detail_includes_catalog_rewards_and_group_offers(api_client):
    business = Business.objects.create(
        **business_payload("Manas Coffee"),
        status=Business.Status.APPROVED,
        visibility_status=Business.VisibilityStatus.PUBLISHED,
        latitude="42.874600",
        longitude="74.569800",
        tags=["Brunch"],
    )
    CatalogItem.objects.create(business=business, module="menu", name="Cappuccino", category="Coffee", price="150 c")
    RewardProgram.objects.create(
        business=business,
        type=RewardProgram.Type.STAMP,
        title="Buy 5 coffees",
        description="Collect stamps",
        required_count=5,
        reward_description="Free coffee",
        is_active=True,
    )
    GroupOffer.objects.create(
        business=business,
        title="Bring friends",
        description="Coffee group deal",
        category="coffee",
        min_group_size=3,
        reward_type=GroupOffer.RewardType.GROUP_DISCOUNT,
        reward_description="15% off",
        status=GroupOffer.Status.ACTIVE,
    )

    res = api_client.get(f"/api/businesses/{business.id}/?lat=42.8745&lng=74.5697")

    assert res.status_code == 200
    data = res.data["data"]
    assert "business_code" not in data
    assert data["distance_km"] is not None
    assert data["catalog_sections"][0]["title"] == "Coffee"
    assert data["catalog_sections"][0]["items"][0]["name"] == "Cappuccino"
    assert data["rewards"][0]["reward_description"] == "Free coffee"
    assert data["group_offers"][0]["reward_description"] == "15% off"


def test_admin_approves_rejects_and_disables_businesses(api_client):
    owner = User.objects.create_user(phone="+996700111225", role=User.Role.BUSINESS_OWNER, is_phone_verified=True)
    business = Business.objects.create(owner=owner, **business_payload())
    admin = User.objects.create_superuser(phone="+996700111226", password="secret")
    api_client.force_authenticate(admin)

    pending = api_client.get("/api/admin/businesses/pending/")
    approve = api_client.post(f"/api/admin/businesses/{business.id}/approve/")
    reject = api_client.post(f"/api/admin/businesses/{business.id}/reject/", {"reason": "bad docs"}, format="json")
    disable = api_client.post(f"/api/admin/businesses/{business.id}/disable/")

    assert len(pending.data["data"]["results"]) == 1
    assert approve.data["data"]["status"] == Business.Status.APPROVED
    assert reject.data["data"]["status"] == Business.Status.REJECTED
    assert disable.data["data"]["status"] == Business.Status.DISABLED
