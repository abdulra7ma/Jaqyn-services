"""Shared server-side image compressor.

Every image uploaded to Jaqyn (user/staff avatars, business logo + cover,
campaign social image) is re-encoded through :func:`compress_image` *before* it is
saved. The why: uploads arrive straight from phone cameras at multi-megapixel /
multi-megabyte sizes. Storing them verbatim wastes R2 storage and burns the
customer's mobile bandwidth on every render. Downscaling to a sane longest-side
bound and re-encoding to WEBP at a high-but-lossy quality typically cuts the
payload by an order of magnitude with no visible loss at the sizes these images
are actually displayed.

Per-kind max-dimension constants live here so every call site bounds its uploads
to the size that surface actually renders at; the values come from the frontend
layouts (avatar chips ~64px @3x, logo tiles ~160px @3x, full-bleed covers /
social cards). ``quality`` and ``fmt`` defaults come from WEBP guidance: q82 is
the standard "visually lossless enough for photos" knob.
"""

from __future__ import annotations

from io import BytesIO
from typing import IO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

from core.exceptions import JaqynAPIException

# Per-kind longest-side bounds (pixels). An upload is never upscaled — these are
# ceilings, not targets. Provenance: the largest size each surface renders at on
# a 3x retina display, rounded up.
AVATAR_MAX_DIM = 256  # avatar chips / profile photos — small, never shown large
LOGO_MAX_DIM = 512  # business logo tiles — square brand mark
COVER_MAX_DIM = 1600  # business cover / hero — full-bleed banner
CAMPAIGN_MAX_DIM = 1600  # campaign social-share card — shared at story/post size

# Default WEBP quality. 82 is the conventional "visually lossless for photos"
# setting — high enough to avoid artefacts, low enough to keep files small.
_DEFAULT_QUALITY = 82

# File extension per encoder, so the saved name advertises the real format.
_EXTENSION_BY_FORMAT = {"WEBP": "webp", "JPEG": "jpg", "PNG": "png"}

# White flatten background for alpha images encoded to a format without alpha
# (JPEG). RGB white matches the app's cream/light surfaces well enough.
_FLATTEN_BACKGROUND = (255, 255, 255)


def compress_image(
    uploaded_file: IO[bytes],
    *,
    max_dim: int,
    quality: int = _DEFAULT_QUALITY,
    fmt: str = "WEBP",
) -> ContentFile:
    """Downscale, strip, and re-encode an uploaded image.

    Steps, in order:

    1. Open the upload with Pillow. If Pillow cannot identify it as an image,
       raise ``JaqynAPIException("INVALID_IMAGE", ...)`` (HTTP 400) — an
       unparseable upload is bad input, not a server fault.
    2. Apply EXIF orientation (``exif_transpose``) so phone photos taken
       sideways are stored upright; this also drops the now-meaningless EXIF
       orientation tag.
    3. Downscale in place so the longest side is at most ``max_dim``. Never
       upscale: an image already within bounds keeps its dimensions.
    4. For an alpha-capable target (WEBP) keep the alpha channel; for JPEG
       flatten any alpha onto a white background, since JPEG has no transparency.
    5. Re-encode to ``fmt`` with ``optimize=True`` and ``quality``. Pillow's
       ``save`` writes a fresh image with no source metadata, so EXIF/GPS/etc.
       are stripped (privacy + bytes).

    Args:
        uploaded_file: A Django ``UploadedFile`` (or any file-like / path Pillow
            can open).
        max_dim: Longest-side ceiling in pixels — pass one of the ``*_MAX_DIM``
            constants for the kind of image being saved.
        quality: Encoder quality (1–100). Defaults to 82.
        fmt: Pillow format name — ``"WEBP"`` (default, keeps alpha) or ``"JPEG"``
            (flattens alpha).

    Returns:
        A Django ``ContentFile`` holding the re-encoded bytes, with a ``name``
        carrying the extension that matches ``fmt`` (e.g. ``image.webp``). The
        caller assigns it to an ``ImageField``.

    Raises:
        JaqynAPIException: code ``INVALID_IMAGE`` (400) if the upload is not a
            decodable image.
    """
    try:
        opened = Image.open(uploaded_file)
        opened.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise JaqynAPIException(
            code="INVALID_IMAGE",
            message="The uploaded file is not a valid image",
            status_code=400,
        ) from exc

    # 2. Honour EXIF orientation, then forget it. exif_transpose returns a fresh
    # image (or None if the source is None, which can't happen here).
    image: Image.Image = ImageOps.exif_transpose(opened) or opened

    # 3. Downscale only — never enlarge a small upload.
    longest = max(image.width, image.height)
    if longest > max_dim:
        scale = max_dim / longest
        new_size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        image = image.resize(new_size, Image.Resampling.LANCZOS)

    fmt = fmt.upper()

    # 4. Reconcile alpha with the target format.
    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    if fmt == "WEBP":
        # WEBP keeps alpha; normalise to RGBA/RGB so the encoder is happy.
        image = image.convert("RGBA" if has_alpha else "RGB")
    else:  # JPEG (and any other non-alpha target) — flatten onto white.
        if has_alpha:
            rgba = image.convert("RGBA")
            background = Image.new("RGB", rgba.size, _FLATTEN_BACKGROUND)
            background.paste(rgba, mask=rgba.split()[-1])
            image = background
        else:
            image = image.convert("RGB")

    # 5. Re-encode. A fresh save() carries no source metadata.
    buffer = BytesIO()
    image.save(buffer, format=fmt, optimize=True, quality=quality)
    buffer.seek(0)

    extension = _EXTENSION_BY_FORMAT.get(fmt, fmt.lower())
    return ContentFile(buffer.read(), name=f"image.{extension}")
