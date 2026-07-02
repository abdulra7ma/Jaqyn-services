"""
Tests for staff profile avatar and emoji endpoints.

Covers:
- emoji update persists and clears any uploaded photo
- photo upload sets avatar, serializer returns /media/... relative url, clears emoji
- STAFF user (no CustomerProfile) can update name + avatar_emoji via profile endpoint
"""

import io

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import User
from apps.accounts.services import otp_key

pytestmark = pytest.mark.django_db


def _png_bytes(width: int = 8, height: int = 8) -> bytes:
    """A real, fully-decodable PNG. The avatar upload now decodes + re-encodes the
    image server-side, so the test fixture must be a valid image (not a truncated
    byte blob)."""
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (width, height), (200, 90, 60)).save(buf, format="PNG")
    return buf.getvalue()


# A valid Pillow-parseable PNG used across the avatar tests.
_PNG_1x1 = _png_bytes()


def _login(api_client, phone):
    """Helper: register/login a user and return the authenticated api_client."""
    api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")
    code = cache.get(otp_key(phone))["code"]
    login = api_client.post("/api/auth/verify-otp/", {"phone": phone, "code": code}, format="json")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")
    return api_client


def _make_staff_user():
    """Create a STAFF-role user with no CustomerProfile."""
    return User.objects.create_user(
        phone="+996700555001",
        password="pass",
        role=User.Role.STAFF,
        name="Staff Member",
    )


def test_emoji_update_persists_and_clears_photo(api_client, settings):
    """Setting avatar_emoji via PATCH /profile/ persists the value and clears any avatar."""
    settings.DEV_LOGIN_OTP = "123456"
    phone = "+996700555002"
    # Create staff user and log them in via password
    user = User.objects.create_user(phone=phone, password="pass", role=User.Role.STAFF)
    # Give the user a photo first
    user.avatar = SimpleUploadedFile("photo.png", _PNG_1x1, content_type="image/png")
    user.save()

    # Authenticate via OTP (staff users have no email; phone OTP is the correct path)
    api_client.post("/api/auth/request-otp/", {"phone": phone}, format="json")
    code = cache.get(otp_key(phone))["code"]
    login = api_client.post("/api/auth/verify-otp/", {"phone": phone, "code": code}, format="json")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['access']}")

    response = api_client.patch(
        "/api/auth/profile/",
        {"avatar_emoji": "🦊"},
        format="json",
    )

    assert response.status_code == 200
    user.refresh_from_db()
    assert user.avatar_emoji == "🦊"
    assert not user.avatar  # photo cleared
    # Serializer also reflects the change
    assert response.data["data"]["user"]["avatar_emoji"] == "🦊"
    assert response.data["data"]["user"]["avatar"] is None


def test_photo_upload_sets_avatar_relative_url_and_clears_emoji(api_client):
    """POST /api/auth/avatar/ saves avatar, returns relative /media/ url, clears emoji."""
    phone = "+996700555003"
    _login(api_client, phone)
    user = User.objects.get(phone=phone)
    # Pre-set emoji
    user.avatar_emoji = "🐱"
    user.save()

    image_file = SimpleUploadedFile("avatar.png", _PNG_1x1, content_type="image/png")
    response = api_client.post(
        "/api/auth/avatar/",
        {"avatar": image_file},
        format="multipart",
    )

    assert response.status_code == 200
    user_data = response.data["data"]["user"]

    # URL must be relative (starts with /media/), not an absolute localhost URL
    avatar_url = user_data["avatar"]
    assert avatar_url is not None
    assert avatar_url.startswith("/media/"), f"Expected relative /media/ url, got: {avatar_url!r}"
    assert "localhost" not in avatar_url
    assert "127.0.0.1" not in avatar_url

    # emoji must be cleared
    assert user_data["avatar_emoji"] == ""

    user.refresh_from_db()
    assert bool(user.avatar)
    assert user.avatar_emoji == ""
    # The upload is compressed + re-encoded to webp server-side.
    assert user.avatar.name.endswith(".webp")


def test_avatar_upload_compresses_large_image(api_client, settings, tmp_path):
    """A large avatar upload is downscaled to the avatar bound before saving."""
    from PIL import Image

    from core.images import AVATAR_MAX_DIM

    settings.MEDIA_ROOT = str(tmp_path)
    phone = "+996700555010"
    _login(api_client, phone)

    big = SimpleUploadedFile("big.png", _png_bytes(1000, 1000), content_type="image/png")
    response = api_client.post("/api/auth/avatar/", {"avatar": big}, format="multipart")
    assert response.status_code == 200

    user = User.objects.get(phone=phone)
    with user.avatar.open("rb") as fh:
        out = Image.open(fh)
        assert max(out.width, out.height) <= AVATAR_MAX_DIM


def test_avatar_upload_rejects_unparseable_image(api_client):
    """An undecodable avatar upload is rejected with a 400 (INVALID_IMAGE / validation)."""
    phone = "+996700555011"
    _login(api_client, phone)

    bad = SimpleUploadedFile("bad.png", b"not really a png", content_type="image/png")
    response = api_client.post("/api/auth/avatar/", {"avatar": bad}, format="multipart")

    assert response.status_code == 400
    assert response.data["success"] is False


def test_avatar_upload_requires_file(api_client):
    """POST /api/auth/avatar/ without a file returns a 400 error."""
    phone = "+996700555004"
    _login(api_client, phone)

    response = api_client.post("/api/auth/avatar/", {}, format="multipart")

    assert response.status_code == 400
    assert response.data["success"] is False
    assert response.data["error"]["code"] == "AVATAR_REQUIRED"


def test_staff_user_profile_update_name_and_emoji(api_client):
    """STAFF user with no CustomerProfile can update name and avatar_emoji without crashing."""
    staff = _make_staff_user()
    # Login via email+password
    staff.email = "staff_test@example.com"
    staff.save()
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(staff)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")

    response = api_client.patch(
        "/api/auth/profile/",
        {"name": "Updated Staff", "avatar_emoji": "🎯"},
        format="json",
    )

    assert response.status_code == 200
    data = response.data["data"]
    assert data["user"]["name"] == "Updated Staff"
    assert data["user"]["avatar_emoji"] == "🎯"
    # No "profile" key — staff user has no CustomerProfile
    assert "profile" not in data

    staff.refresh_from_db()
    assert staff.name == "Updated Staff"
    assert staff.avatar_emoji == "🎯"


def test_staff_emoji_update_does_not_clear_emoji_when_empty_string(api_client):
    """Setting avatar_emoji to '' updates the field but does NOT clear avatar (only non-empty emoji clears it)."""
    staff = _make_staff_user()
    staff.email = "staff_emoji2@example.com"
    # Pre-set an avatar
    staff.avatar = SimpleUploadedFile("photo.png", _PNG_1x1, content_type="image/png")
    staff.save()

    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(staff)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")

    response = api_client.patch(
        "/api/auth/profile/",
        {"avatar_emoji": ""},
        format="json",
    )

    assert response.status_code == 200
    staff.refresh_from_db()
    # avatar must still be set (empty emoji does NOT clear photo)
    assert bool(staff.avatar)
    assert staff.avatar_emoji == ""
