"""Shared Django admin helpers."""

from typing import Optional, Union

from django.db.models.fields.files import FieldFile
from django.utils.html import format_html
from django.utils.safestring import SafeString

# Shown when an image field is empty.
_EMPTY = "—"


def image_thumb(image: Optional[FieldFile], *, size: int = 36, radius: int = 6) -> Union[SafeString, str]:
    """Render a small, lazy-loaded thumbnail for an ImageField value.

    Returns an ``<img>`` bounded to ``size`` px (object-fit: cover) with
    ``loading="lazy"`` and ``decoding="async"`` so a changelist full of thumbnails
    never blocks rendering — the browser fetches them off the critical path. Falls
    back to an em-dash when the field is empty. No DB query: operates on the
    already-loaded field value (images are model fields, not relations).
    """
    if not image:
        return _EMPTY
    return format_html(
        '<img src="{}" loading="lazy" decoding="async" width="{}" height="{}" '
        'style="width:{}px;height:{}px;object-fit:cover;border-radius:{}px;'
        'border:1px solid rgba(0,0,0,0.08);" alt="">',
        image.url, size, size, size, size, radius,
    )
