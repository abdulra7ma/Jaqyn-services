from django.core.cache import cache


def hit_limit(key, limit, window_seconds):
    current = cache.get(key, 0) + 1
    cache.set(key, current, window_seconds)
    return current > limit


def clear_limit(key):
    cache.delete(key)
