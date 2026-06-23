"""API tests for the business brand-asset upload endpoints.

Covers, for both /api/business/profile/logo/ and /cover/:
- auth (401 without a token)
- permission (403 for a non-owner role)
- happy path: compresses + saves, flips logo_set/cover_set, returns relative
  /media/ url via the owner serializer
- an unparseable upload -> INVALID_IMAGE 400
"""

from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.businesses.models import Business

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _tmp_media(settings, tmp_path):
    """Write uploads to a throwaway dir so the suite never touches real media."""
    settings.MEDIA_ROOT = str(tmp_path)


def _owner_with_business(suffix: str = "001") -> User:
    owner = User.objects.create_user(
        phone=f"+99670700{suffix}", role=User.Role.BUSINESS_OWNER, is_phone_verified=True
    )
    Business.objects.create(owner=owner, name=f"Brand Cafe {suffix}", category="cafe")
    return owner


def _auth(user: User) -> APIClient:
    client = APIClient()
    client.force_authenticate(user)
    return client


def _png_upload(width: int = 1200, height: int = 1200) -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (200, 90, 60)).save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile("brand.png", buf.read(), content_type="image/png")


# --- auth -------------------------------------------------------------------


@pytest.mark.parametrize("path", ["logo", "cover"])
def test_upload_requires_auth(path):
    response = APIClient().post(
        f"/api/business/profile/{path}/", {"image": _png_upload()}, format="multipart"
    )
    assert response.status_code == 401


# --- permission -------------------------------------------------------------


@pytest.mark.parametrize("path", ["logo", "cover"])
def test_upload_rejects_non_owner(path):
    customer = User.objects.create_user(
        phone="+996707009999", role=User.Role.CUSTOMER, is_phone_verified=True
    )
    response = _auth(customer).post(
        f"/api/business/profile/{path}/", {"image": _png_upload()}, format="multipart"
    )
    assert response.status_code == 403


# --- happy path -------------------------------------------------------------


def test_logo_upload_saves_compresses_and_returns_url():
    owner = _owner_with_business("010")
    response = _auth(owner).post(
        "/api/business/profile/logo/", {"image": _png_upload()}, format="multipart"
    )

    assert response.status_code == 200
    data = response.data["data"]
    assert data["logo_set"] is True
    logo_url = data["logo_url"]
    assert logo_url is not None
    # Relative /media/... url so it passes the frontend proxy.
    assert logo_url.startswith("/media/")
    assert "localhost" not in logo_url and "127.0.0.1" not in logo_url

    business = Business.objects.get(owner=owner)
    assert business.logo_set is True
    assert bool(business.logo)
    # Re-encoded to webp by the compressor.
    assert business.logo.name.endswith(".webp")


def test_cover_upload_saves_compresses_and_returns_url():
    owner = _owner_with_business("011")
    response = _auth(owner).post(
        "/api/business/profile/cover/", {"image": _png_upload(2400, 1200)}, format="multipart"
    )

    assert response.status_code == 200
    data = response.data["data"]
    assert data["cover_set"] is True
    cover_url = data["cover_url"]
    assert cover_url is not None
    assert cover_url.startswith("/media/")

    business = Business.objects.get(owner=owner)
    assert business.cover_set is True
    assert bool(business.cover_image)
    assert business.cover_image.name.endswith(".webp")


# --- bad input --------------------------------------------------------------


@pytest.mark.parametrize("path", ["logo", "cover"])
def test_upload_rejects_unparseable_image(path):
    owner = _owner_with_business("020" if path == "logo" else "021")
    bad = SimpleUploadedFile("bad.png", b"not an image at all", content_type="image/png")

    response = _auth(owner).post(
        f"/api/business/profile/{path}/", {"image": bad}, format="multipart"
    )

    # DRF ImageField rejects an undecodable upload at the serializer layer (400).
    assert response.status_code == 400
    assert response.data["success"] is False
