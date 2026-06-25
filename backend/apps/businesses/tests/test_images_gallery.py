"""Tests for catalog item image upload, business gallery, and public detail payload.

Covers:
- CatalogItemImageUploadView: 401 (no auth), 403 (wrong role), 200 happy path
  (image_url set + compressed), 400 bad upload, 404 foreign item.
- GalleryListCreateView: 401, 403, GET list, POST add, POST cap at 8 → 409.
- GalleryDetailView: 401, 403, DELETE happy path, DELETE foreign id → 404.
- PublicBusinessDetailView: payload carries item image_url and gallery[].
"""

from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.businesses.models import Business, BusinessImage, CatalogItem
from apps.businesses.services import GALLERY_LIMIT

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _tmp_media(settings, tmp_path):
    """Write uploads to a throwaway directory; never touches real media."""
    settings.MEDIA_ROOT = str(tmp_path)


def _make_owner(suffix: str = "001") -> User:
    return User.objects.create_user(
        phone=f"+99670800{suffix}", role=User.Role.BUSINESS_OWNER, is_phone_verified=True
    )


def _make_business(owner: User, name: str = "Test Biz") -> Business:
    return Business.objects.create(
        owner=owner,
        name=name,
        category="cafe",
        status=Business.Status.APPROVED,
        visibility_status=Business.VisibilityStatus.PUBLISHED,
    )


def _make_catalog_item(business: Business) -> CatalogItem:
    return CatalogItem.objects.create(business=business, name="Espresso", price="80 c")


def _auth(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user)
    return client


def _png(width: int = 1000, height: int = 1000) -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (200, 90, 60)).save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile("photo.png", buf.read(), content_type="image/png")


def _customer() -> User:
    return User.objects.create_user(
        phone="+99670899999", role=User.Role.CUSTOMER, is_phone_verified=True
    )


# ---------------------------------------------------------------------------
# Catalog item image upload
# ---------------------------------------------------------------------------


def test_catalog_image_upload_requires_auth():
    owner = _make_owner("100")
    biz = _make_business(owner)
    item = _make_catalog_item(biz)
    res = APIClient().post(
        f"/api/business/catalog-items/{item.id}/image/",
        {"image": _png()},
        format="multipart",
    )
    assert res.status_code == 401


def test_catalog_image_upload_rejects_non_owner():
    res = _auth(_customer()).post(
        "/api/business/catalog-items/00000000-0000-0000-0000-000000000001/image/",
        {"image": _png()},
        format="multipart",
    )
    assert res.status_code == 403


def test_catalog_image_upload_happy_path():
    owner = _make_owner("101")
    biz = _make_business(owner)
    item = _make_catalog_item(biz)

    res = _auth(owner).post(
        f"/api/business/catalog-items/{item.id}/image/",
        {"image": _png(1200, 1200)},
        format="multipart",
    )

    assert res.status_code == 200
    data = res.data["data"]
    # image_url must be present and a relative /media/ path
    assert data["image_url"] is not None
    assert data["image_url"].startswith("/media/")

    item.refresh_from_db()
    assert bool(item.image)
    # Compressed to WEBP
    assert item.image.name.endswith(".webp")


def test_catalog_image_upload_rejects_bad_file():
    owner = _make_owner("102")
    biz = _make_business(owner)
    item = _make_catalog_item(biz)
    bad = SimpleUploadedFile("bad.png", b"not an image", content_type="image/png")

    res = _auth(owner).post(
        f"/api/business/catalog-items/{item.id}/image/",
        {"image": bad},
        format="multipart",
    )
    assert res.status_code == 400


def test_catalog_image_upload_rejects_foreign_item():
    """An owner cannot upload an image for another business's item."""
    owner_a = _make_owner("103")
    owner_b = _make_owner("104")
    biz_a = _make_business(owner_a, "Biz A")
    _make_business(owner_b, "Biz B")
    item_a = _make_catalog_item(biz_a)

    # owner_b tries to upload to owner_a's item
    res = _auth(owner_b).post(
        f"/api/business/catalog-items/{item_a.id}/image/",
        {"image": _png()},
        format="multipart",
    )
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Gallery list / create
# ---------------------------------------------------------------------------


def test_gallery_list_requires_auth():
    res = APIClient().get("/api/business/gallery/")
    assert res.status_code == 401


def test_gallery_list_rejects_non_owner():
    res = _auth(_customer()).get("/api/business/gallery/")
    assert res.status_code == 403


def test_gallery_add_and_list():
    owner = _make_owner("200")
    _make_business(owner)

    client = _auth(owner)

    # Initially empty
    res = client.get("/api/business/gallery/")
    assert res.status_code == 200
    assert res.data["data"]["results"] == []

    # Add one image
    res = client.post("/api/business/gallery/", {"image": _png()}, format="multipart")
    assert res.status_code == 201
    data = res.data["data"]
    assert data["image_url"].startswith("/media/")
    assert data["sort_order"] == 0

    # List now has one entry
    res = client.get("/api/business/gallery/")
    assert len(res.data["data"]["results"]) == 1


def test_gallery_add_second_image_increments_sort_order():
    owner = _make_owner("201")
    biz = _make_business(owner)
    client = _auth(owner)

    client.post("/api/business/gallery/", {"image": _png()}, format="multipart")
    res = client.post("/api/business/gallery/", {"image": _png()}, format="multipart")

    assert res.status_code == 201
    assert res.data["data"]["sort_order"] == 1
    assert biz.gallery_images.count() == 2


def test_gallery_cap_at_limit_returns_409():
    """Adding more than GALLERY_LIMIT images raises 409 GALLERY_LIMIT_REACHED."""
    owner = _make_owner("202")
    biz = _make_business(owner)

    # Pre-fill to the limit via the model directly (faster than 8 API calls)
    for i in range(GALLERY_LIMIT):
        BusinessImage.objects.create(
            business=biz,
            image=SimpleUploadedFile(f"img{i}.webp", b"x", content_type="image/webp"),
            sort_order=i,
        )

    res = _auth(owner).post(
        "/api/business/gallery/", {"image": _png()}, format="multipart"
    )
    assert res.status_code == 409
    assert res.data["error"]["code"] == "GALLERY_LIMIT_REACHED"


def test_gallery_add_requires_auth():
    res = APIClient().post("/api/business/gallery/", {"image": _png()}, format="multipart")
    assert res.status_code == 401


def test_gallery_add_rejects_non_owner():
    res = _auth(_customer()).post(
        "/api/business/gallery/", {"image": _png()}, format="multipart"
    )
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Gallery delete
# ---------------------------------------------------------------------------


def test_gallery_delete_happy_path():
    owner = _make_owner("300")
    biz = _make_business(owner)
    gi = BusinessImage.objects.create(
        business=biz,
        image=SimpleUploadedFile("img.webp", b"x", content_type="image/webp"),
        sort_order=0,
    )

    res = _auth(owner).delete(f"/api/business/gallery/{gi.id}/")
    assert res.status_code == 200
    assert not BusinessImage.objects.filter(id=gi.id).exists()


def test_gallery_delete_requires_auth():
    res = APIClient().delete("/api/business/gallery/00000000-0000-0000-0000-000000000001/")
    assert res.status_code == 401


def test_gallery_delete_rejects_non_owner():
    res = _auth(_customer()).delete(
        "/api/business/gallery/00000000-0000-0000-0000-000000000001/"
    )
    assert res.status_code == 403


def test_gallery_delete_foreign_image_returns_404():
    """An owner cannot delete another business's gallery image."""
    owner_a = _make_owner("301")
    owner_b = _make_owner("302")
    biz_a = _make_business(owner_a, "Biz A")
    _make_business(owner_b, "Biz B")
    gi = BusinessImage.objects.create(
        business=biz_a,
        image=SimpleUploadedFile("img.webp", b"x", content_type="image/webp"),
        sort_order=0,
    )

    res = _auth(owner_b).delete(f"/api/business/gallery/{gi.id}/")
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Public detail payload
# ---------------------------------------------------------------------------


def test_public_detail_includes_item_image_url_and_gallery():
    owner = _make_owner("400")
    biz = _make_business(owner)

    # Add a catalog item (no image yet — image_url should be None)
    item = _make_catalog_item(biz)

    # Add a gallery image via the model
    gi = BusinessImage.objects.create(
        business=biz,
        image=SimpleUploadedFile("g.webp", b"x", content_type="image/webp"),
        caption="My café",
        sort_order=0,
    )

    res = APIClient().get(f"/api/businesses/{biz.id}/")
    assert res.status_code == 200
    payload = res.data["data"]

    # Catalog item carries image_url (None because no image set)
    sections = payload["catalog_sections"]
    assert len(sections) > 0
    catalog_item_data = sections[0]["items"][0]
    assert "image_url" in catalog_item_data
    assert catalog_item_data["image_url"] is None

    # Gallery array present
    gallery = payload["gallery"]
    assert isinstance(gallery, list)
    assert len(gallery) == 1
    assert gallery[0]["id"] == str(gi.id)
    assert gallery[0]["caption"] == "My café"
    assert gallery[0]["sort_order"] == 0


def test_public_detail_item_image_url_present_when_image_set(settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)

    owner = _make_owner("401")
    biz = _make_business(owner)
    item = _make_catalog_item(biz)

    # Simulate a compressed upload already saved on the item
    item.image = SimpleUploadedFile("product.webp", b"x", content_type="image/webp")
    item.save(update_fields=["image", "updated_at"])

    res = APIClient().get(f"/api/businesses/{biz.id}/")
    assert res.status_code == 200
    sections = res.data["data"]["catalog_sections"]
    item_data = sections[0]["items"][0]
    assert item_data["image_url"] is not None
