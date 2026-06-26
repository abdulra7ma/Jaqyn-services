"""Cached read layer for public business discovery (the customer "nearby" list).

The discovery list is hit by every customer on the nearby/map screen and polled
as they move, so it is the hottest read in the app. The DB-bound part — the
filtered query plus the heavy ``PublicBusinessSerializer`` (which prefetches
catalog, rewards, group offers and gallery) — is **origin-independent**: only
``distance_km`` depends on the requesting user's location, and that is injected
per request in pure Python from the cached ``latitude``/``longitude``.

So we cache the serialized payload keyed by the *filter* combination
(search/category/area) and let every user share it. A burst of nearby requests
collapses to a single DB read per filter combo per TTL. The cache is busted
immediately on any business-content change via ``signals.py``; ``CACHE_TTL`` is a
safety net, not the primary freshness mechanism.
"""

from __future__ import annotations

import hashlib

from django.core.cache import cache
from django.db.models import Q

from apps.businesses.models import Business
from apps.businesses.serializers import PublicBusinessSerializer

# 5 minutes. Long because invalidation is event-driven (signals bust on write);
# the TTL only bounds staleness if a signal is ever missed (e.g. a bulk update
# that doesn't fire post_save).
CACHE_TTL_SECONDS = 300
# Every discovery key lives under "nearby:" so one delete_pattern() clears the
# whole layer (list payloads + the category list).
_LIST_PREFIX = "nearby:list:"
_CATEGORY_KEY = "nearby:categories"
_BUST_PATTERN = "nearby:*"


def _cache_key(search: str, category: str, area: str) -> str:
    """Stable key for one filter combination (case-insensitive)."""
    raw = f"{search}|{category}|{area}".lower()
    return _LIST_PREFIX + hashlib.sha1(raw.encode()).hexdigest()


def public_business_payload(*, search: str, category: str, area: str) -> list[dict]:
    """Return the cached, origin-independent serialized public-business list for a
    filter combination, serializing from the DB only on a cache miss.

    ``distance_km`` in the returned dicts is always ``None`` — the caller injects
    the per-user distance from ``latitude``/``longitude``. The returned list is a
    fresh copy that the caller may mutate safely.
    """
    key = _cache_key(search, category, area)
    cached = cache.get(key)
    if cached is None:
        cached = _serialize(search=search, category=category, area=area)
        cache.set(key, cached, CACHE_TTL_SECONDS)
    # Copy each row so a caller injecting distance_km can never mutate the cached
    # object (locmem returns the same reference; redis returns a fresh unpickle).
    return [dict(row) for row in cached]


def active_category_payload() -> list[dict]:
    """Return ``[{"value", "label"}]`` for only the ``Business.Category`` values that
    have at least one discoverable (approved + published) business, in enum order.

    So the customer's category filter never offers a chip that would return an
    empty list. Cached and busted by the same signals as the discovery list.
    """
    cached = cache.get(_CATEGORY_KEY)
    if cached is None:
        active = set(
            Business.objects.filter(
                status=Business.Status.APPROVED,
                visibility_status=Business.VisibilityStatus.PUBLISHED,
            )
            .exclude(category="")
            .values_list("category", flat=True)
        )
        cached = [
            {"value": value, "label": str(label)}
            for value, label in Business.Category.choices
            if value in active
        ]
        cache.set(_CATEGORY_KEY, cached, CACHE_TTL_SECONDS)
    return cached


def _serialize(*, search: str, category: str, area: str) -> list[dict]:
    """Run the filtered discovery query and serialize it (the DB-bound work)."""
    qs = (
        Business.objects.filter(
            status=Business.Status.APPROVED,
            visibility_status=Business.VisibilityStatus.PUBLISHED,
        )
        .prefetch_related("catalog_items", "reward_programs", "group_offers", "gallery_images")
        .order_by("name")
    )
    if search:
        qs = qs.filter(
            Q(name__icontains=search)
            | Q(category__icontains=search)
            | Q(area__icontains=search)
            | Q(address__icontains=search)
            | Q(description__icontains=search)
        )
    if category and category != "all":
        qs = qs.filter(category=category)
    if area:
        qs = qs.filter(area__icontains=area)
    # No request in context: every serialized field is request-independent
    # (logo_url/cover_url are relative /media urls; distance_km resolves to None).
    return [dict(row) for row in PublicBusinessSerializer(list(qs), many=True).data]


def clear_public_business_cache() -> None:
    """Drop every cached discovery payload. Called from signals on any change to
    a business or its content so the next request re-serializes fresh.

    Uses ``delete_pattern`` on django-redis (prod); falls back to clearing the
    whole cache on backends without it (e.g. LocMemCache in tests), which is safe
    because those backends are non-shared and short-lived.
    """
    delete_pattern = getattr(cache, "delete_pattern", None)
    if delete_pattern is not None:
        delete_pattern(_BUST_PATTERN)
    else:
        cache.clear()
