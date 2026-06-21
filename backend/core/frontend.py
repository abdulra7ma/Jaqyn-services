from urllib.parse import urlsplit

from django.conf import settings


def frontend_base_url(request) -> str:
    """Frontend origin (scheme://host[:port]) the QR link should point at.

    The web app calls the API same-origin and Next proxies `/api/*` to the
    backend, so the visitor's real host arrives in forwarded/browser headers.
    We use that so a QR scanned from a phone (LAN IP, tunnel, etc.) opens the
    same origin the user is on — falling back to FRONTEND_URL when no request
    context is available (Celery tasks, management commands).
    """
    if request is not None:
        # Origin / Referer are set by the browser and reflect the actual page.
        origin = request.META.get("HTTP_ORIGIN")
        if origin:
            return origin.rstrip("/")

        referer = request.META.get("HTTP_REFERER")
        if referer:
            parts = urlsplit(referer)
            if parts.scheme and parts.netloc:
                return f"{parts.scheme}://{parts.netloc}"

        # Forwarded headers set by the Next proxy / nginx in front of us.
        host = request.META.get("HTTP_X_FORWARDED_HOST")
        if host:
            proto = request.META.get("HTTP_X_FORWARDED_PROTO", "https").split(",")[0].strip()
            return f"{proto}://{host.split(',')[0].strip()}"

    return settings.FRONTEND_URL
