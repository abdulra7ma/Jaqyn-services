"""Shared field validators for DRF serializers.

Centralising them here keeps the rule in one place and the why-comment
with the constant, so a future raise of the cap is a one-line change.
"""

from rest_framework import serializers

# 5 MB.  Generous for phone-camera photos after JPEG/WebP compression
# (typical flagship phone shot at high quality is 2–4 MB); gives enough
# headroom for uncompressed PNGs without letting the field-level validator
# be bypassed by absurdly large payloads.  This is the per-file cap that
# produces a friendly HTTP 400 *before* the backend compressor sees the
# bytes.  The Django DATA_UPLOAD_MAX_MEMORY_SIZE / FILE_UPLOAD_MAX_MEMORY_SIZE
# settings in config/settings/base.py are set higher (10 MB) so the Django
# request-parsing layer does not reject a borderline-OK upload before our
# field validator can return the structured error response.
#
# Security note: this validator runs after Django has already received all
# the bytes, so it bounds R2 storage and prevents wasted compression work
# rather than reducing network ingress.  True upload-DoS prevention belongs
# at the reverse proxy / Railway ingress limit.
MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB


def validate_image_size(value: object) -> None:
    """Reject an image upload whose on-disk size exceeds MAX_IMAGE_UPLOAD_BYTES.

    Raises a DRF ``ValidationError`` so the caller receives a structured 400.
    Attach to an ImageField via ``validators=[validate_image_size]``.
    """
    size: int = getattr(value, "size", 0)
    if size > MAX_IMAGE_UPLOAD_BYTES:
        mb = MAX_IMAGE_UPLOAD_BYTES // (1024 * 1024)
        raise serializers.ValidationError(
            f"Image file too large. Maximum allowed size is {mb} MB."
        )
