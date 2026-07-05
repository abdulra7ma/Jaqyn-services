from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403

DEBUG = False

# H2: DEV_LOGIN_OTP must never be set in production — it bypasses real OTP auth.
if DEV_LOGIN_OTP:  # noqa: F405  (imported via base.py wildcard)
    raise ImproperlyConfigured("DEV_LOGIN_OTP must be empty in production")

# H3: Console email backend silently drops all mail — require a real SMTP backend.
if EMAIL_BACKEND.endswith("console.EmailBackend"):  # noqa: F405
    raise ImproperlyConfigured("EMAIL_BACKEND must be a real SMTP backend in production")

# H4: Google sign-in cannot verify tokens without a configured client id.
if not GOOGLE_OAUTH_CLIENT_ID:  # noqa: F405
    raise ImproperlyConfigured("GOOGLE_OAUTH_CLIENT_ID must be set in production")
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Hashed + gzip/brotli static files served by WhiteNoise. Requires collectstatic
# (entrypoint runs it when DJANGO_COLLECTSTATIC=true).
STORAGES["staticfiles"] = {  # noqa: F405
    "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
}

# HTTPS hardening (Railway/Vercel terminate TLS and forward X-Forwarded-Proto).
SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "true").lower() == "true"  # noqa: F405
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))  # noqa: F405
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# CSRF trusted origins for the Django admin behind the proxy (comma-separated
# https URLs, e.g. https://jaqyn-api.up.railway.app).
CSRF_TRUSTED_ORIGINS = [  # noqa: F405
    o.strip() for o in os.getenv("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",") if o.strip()  # noqa: F405
]
