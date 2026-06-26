"""Event-driven invalidation for the public business discovery cache.

Any change to a business or the content the discovery payload embeds (catalog,
rewards, gallery, group offers) drops every cached ``nearby:list:*`` entry, so the
next customer request re-serializes fresh. This is the primary freshness
mechanism; the cache TTL is only a safety net (see ``discovery.py``).
"""

from __future__ import annotations

from typing import Any

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.businesses.discovery import clear_public_business_cache
from apps.businesses.models import Business, BusinessImage, CatalogItem


@receiver(post_save, sender=Business)
@receiver(post_delete, sender=Business)
@receiver(post_save, sender=CatalogItem)
@receiver(post_delete, sender=CatalogItem)
@receiver(post_save, sender=BusinessImage)
@receiver(post_delete, sender=BusinessImage)
def _bust_on_business_content_change(sender: type, **kwargs: Any) -> None:
    clear_public_business_cache()


def connect_cross_app_signals() -> None:
    """Connect signals for models owned by other apps (imported lazily to avoid an
    import cycle at app-loading time). Called from ``BusinessesConfig.ready``.

    A campaign change busts the discovery cache (campaigns replaced the deleted
    loyalty programs + group offers that the discovery payload used to embed)."""
    from apps.campaigns.models import Campaign

    for model in (Campaign,):
        post_save.connect(_bust_on_business_content_change, sender=model)
        post_delete.connect(_bust_on_business_content_change, sender=model)
