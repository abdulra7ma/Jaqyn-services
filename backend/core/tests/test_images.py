"""Unit tests for the shared image compressor (core.images).

Covers: a large image is downscaled so its longest side is bounded and is
re-encoded to the target format; an unparseable upload raises INVALID_IMAGE.
"""

from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from core.exceptions import JaqynAPIException
from core.images import AVATAR_MAX_DIM, compress_image


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
