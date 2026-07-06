"""Unit tests for the shared image compressor (core.images) and validators.

Covers:
- compress_image: large image is downscaled + re-encoded; small image kept; alpha
  flattened for JPEG; non-image upload raises INVALID_IMAGE.
- validate_image_size: file above MAX_IMAGE_UPLOAD_BYTES raises ValidationError;
  file at or below the cap passes through cleanly.
"""

from __future__ import annotations

import io
from unittest.mock import MagicMock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import serializers

from core.exceptions import JaqynAPIException
from core.images import AVATAR_MAX_DIM, compress_image
from core.validators import MAX_IMAGE_UPLOAD_BYTES, validate_image_size


def _png_upload(width: int, height: int, mode: str = "RGB") -> SimpleUploadedFile:
    """Build an in-memory PNG upload of the given dimensions."""
    buf = io.BytesIO()
    Image.new(mode, (width, height), (10, 20, 30) if mode == "RGB" else (10, 20, 30, 128)).save(
        buf, format="PNG"
    )
    buf.seek(0)
    return SimpleUploadedFile("big.png", buf.read(), content_type="image/png")


def test_compress_downsizes_large_image_and_reencodes():
    """A 2000x1000 upload is bounded to AVATAR_MAX_DIM on its longest side and re-encoded to WEBP."""
    upload = _png_upload(2000, 1000)

    result = compress_image(upload, max_dim=AVATAR_MAX_DIM)

    # Re-encoded as WEBP (name + decodable bytes).
    assert result.name.endswith(".webp")
    out = Image.open(io.BytesIO(result.read()))
    assert out.format == "WEBP"
    # Longest side is bounded; aspect ratio preserved (1000 -> 128).
    assert max(out.width, out.height) <= AVATAR_MAX_DIM
    assert out.width == AVATAR_MAX_DIM
    assert out.height == AVATAR_MAX_DIM // 2


def test_compress_never_upscales_small_image():
    """An image already within bounds keeps its dimensions."""
    upload = _png_upload(64, 48)

    result = compress_image(upload, max_dim=AVATAR_MAX_DIM)

    out = Image.open(io.BytesIO(result.read()))
    assert out.size == (64, 48)


def test_compress_jpeg_flattens_alpha():
    """Encoding an RGBA image to JPEG flattens alpha onto white (no crash, RGB output)."""
    upload = _png_upload(300, 300, mode="RGBA")

    result = compress_image(upload, max_dim=AVATAR_MAX_DIM, fmt="JPEG")

    assert result.name.endswith(".jpg")
    out = Image.open(io.BytesIO(result.read()))
    assert out.format == "JPEG"
    assert out.mode == "RGB"


def test_compress_rejects_unparseable_upload():
    """A non-image upload raises INVALID_IMAGE (400)."""
    upload = SimpleUploadedFile("notimage.png", b"this is not an image", content_type="image/png")

    with pytest.raises(JaqynAPIException) as exc:
        compress_image(upload, max_dim=AVATAR_MAX_DIM)

    assert exc.value.code == "INVALID_IMAGE"
    assert exc.value.status_code == 400


# --- D3: validate_image_size unit tests ------------------------------------------
# These exercise the validator at the function level using a mock file object so
# the test never needs to allocate >5 MB of memory.


def _mock_file(size: int) -> MagicMock:
    """Return a mock with a .size attribute, mimicking an UploadedFile."""
    f = MagicMock()
    f.size = size
    return f


def test_validate_image_size_rejects_file_above_cap():
    """validate_image_size raises ValidationError when file.size > MAX_IMAGE_UPLOAD_BYTES."""
    oversized = _mock_file(MAX_IMAGE_UPLOAD_BYTES + 1)

    with pytest.raises(serializers.ValidationError) as exc:
        validate_image_size(oversized)

    assert "5 MB" in str(exc.value.detail)


def test_validate_image_size_accepts_file_exactly_at_cap():
    """A file exactly at MAX_IMAGE_UPLOAD_BYTES is accepted (boundary: equal is OK)."""
    at_cap = _mock_file(MAX_IMAGE_UPLOAD_BYTES)
    validate_image_size(at_cap)  # must not raise


def test_validate_image_size_accepts_small_file():
    """A small file (well under 5 MB) passes through cleanly."""
    small = _mock_file(1024)
    validate_image_size(small)  # must not raise


def test_validate_image_size_wired_on_business_image_serializer():
    """BusinessImageUploadSerializer applies validate_image_size to its ImageField.

    We call it with a file whose reported size exceeds the cap.  DRF runs field
    validators after to_internal_value; we use a real SimpleUploadedFile here so
    the ImageField can decode the bytes, but override .size after construction
    so the mock never allocates >5 MB.  Because DRF's ImageField re-wraps the
    upload as an InMemoryUploadedFile (and that wrapper's .size reads back the
    actual byte length), we test via the direct-validator path instead, and rely
    on the validate_image_size unit tests above to confirm the validator is correct.

    This test instead confirms the validator IS registered on the serializer field.
    """
    from apps.businesses.serializers import BusinessImageUploadSerializer

    field = BusinessImageUploadSerializer().fields["image"]
    assert validate_image_size in field.validators


def test_validate_image_size_wired_on_gallery_serializer():
    """GalleryUploadSerializer applies validate_image_size to its ImageField."""
    from apps.businesses.serializers import GalleryUploadSerializer

    field = GalleryUploadSerializer().fields["image"]
    assert validate_image_size in field.validators


def test_validate_image_size_wired_on_campaign_image_serializer():
    """CampaignImageUploadSerializer applies validate_image_size to its ImageField."""
    from apps.campaigns.serializers import CampaignImageUploadSerializer

    field = CampaignImageUploadSerializer().fields["image"]
    assert validate_image_size in field.validators
