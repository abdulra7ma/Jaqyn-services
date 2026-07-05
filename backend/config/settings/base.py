from datetime import timedelta
import os
from pathlib import Path

import sentry_sdk
from django.templatetags.static import static
from django.urls import reverse_lazy
from django.utils.translation import gettext_lazy as _
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[3]
load_dotenv(BASE_DIR.parent / ".env")


# Truthy env values. Operators commonly write "on"/"1"/"yes" for booleans; a
# strict `== "true"` check silently reads those as False — which is how a prod
# EMAIL_USE_TLS="on" disabled STARTTLS and hung the SMTP connect. Accept the
# common spellings instead. Mirrors django-environ's bool casting.
_TRUTHY = {"true", "1", "yes", "on", "y", "t"}


def _env_bool(name: str, default: str = "false") -> bool:
    """Return the env var `name` parsed as a boolean against `_TRUTHY`."""
    return os.getenv(name, default).strip().lower() in _TRUTHY


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "unsafe-dev-secret")
DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]

INSTALLED_APPS = [
    # Unfold and its contrib modules MUST precede django.contrib.admin so their
    # template overrides and AdminSite theming win template resolution.
    "unfold",
    "unfold.contrib.filters",
    "unfold.contrib.forms",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "apps.accounts",
    "apps.businesses",
    "apps.staff",
    "apps.qr",
    "apps.campaigns",
    "apps.loyalty",
    "apps.reporting",
    "apps.notifications",
    "apps.system",
    "apps.leads",
    "apps.patches",
    "anymail",
]

# --- Django admin theming (django-unfold) ---
# Warm terracotta palette mirrors the Jaqyn frontend design tokens (accent
# #C25E3C). COLORS["primary"] is a 50→950 Tailwind scale; values are
# space-separated RGB channels as unfold requires. Sidebar navigation groups the
# models by operational workflow rather than the default flat per-app list.
UNFOLD = {
    "SITE_TITLE": "Jaqyn Admin",
    "SITE_HEADER": "Jaqyn",
    "SITE_SUBHEADER": "Loyalty & rewards control panel",
    # Material Symbols glyph shown next to the site header.
    "SITE_SYMBOL": "campaign",
    # Browser-tab favicon: the Jaqyn "J" mark (href resolved lazily per request).
    "SITE_FAVICONS": [
        {
            "rel": "icon",
            "sizes": "32x32",
            "type": "image/svg+xml",
            "href": lambda request: static("jaqyn/favicon.svg"),
        },
    ],
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "DASHBOARD_CALLBACK": "apps.reporting.dashboard.dashboard_callback",
    "COLORS": {
        "primary": {
            "50": "251 243 239",
            "100": "246 229 220",
            "200": "236 200 181",
            "300": "224 165 137",
            "400": "210 128 92",
            "500": "194 94 60",  # base accent #C25E3C
            "600": "168 75 47",
            "700": "138 60 38",
            "800": "110 49 32",
            "900": "90 42 29",
            "950": "49 20 16",
        },
    },
    "SIDEBAR": {
        "show_search": True,
        # False: show ONLY the curated navigation groups below, not every
        # registered model. Internal models stay reachable by URL / FK drill-in.
        "show_all_applications": False,
        "navigation": [
            {
                "title": _("Dashboard"),
                "items": [
                    {
                        "title": _("Overview"),
                        "icon": "dashboard",
                        "link": reverse_lazy("admin:index"),
                    },
                    {
                        "title": _("Analytics"),
                        "icon": "insights",
                        "link": reverse_lazy("admin_analytics"),
                    },
                ],
            },
            {
                "title": _("Onboarding & Businesses"),
                "items": [
                    {
                        "title": _("Businesses"),
                        "icon": "store",
                        "link": reverse_lazy("admin:businesses_business_changelist"),
                        # Live count of businesses awaiting review, surfaced on the nav item.
                        "badge": "apps.reporting.dashboard.pending_businesses_badge",
                    },
                    {
                        "title": _("Onboarding notes"),
                        "icon": "forum",
                        "link": reverse_lazy(
                            "admin:businesses_businessnote_changelist"
                        ),
                    },
                    {
                        "title": _("Business types"),
                        "icon": "category",
                        "link": reverse_lazy(
                            "admin:businesses_businesstype_changelist"
                        ),
                    },
                    {
                        "title": _("Owner invites"),
                        "icon": "mail",
                        "link": reverse_lazy(
                            "admin:businesses_businessownerinvite_changelist"
                        ),
                    },
                    {
                        "title": _("Staff invites"),
                        "icon": "group_add",
                        "link": reverse_lazy("admin:businesses_staffinvite_changelist"),
                    },
                    {
                        "title": _("Catalog items"),
                        "icon": "list_alt",
                        "link": reverse_lazy("admin:businesses_catalogitem_changelist"),
                    },
                ],
            },
            {
                "title": _("Customers & Staff"),
                "items": [
                    {
                        "title": _("Users"),
                        "icon": "person",
                        "link": reverse_lazy("admin:accounts_user_changelist"),
                    },
                    {
                        "title": _("Customer profiles"),
                        "icon": "badge",
                        "link": reverse_lazy(
                            "admin:accounts_customerprofile_changelist"
                        ),
                    },
                    {
                        "title": _("Staff members"),
                        "icon": "support_agent",
                        "link": reverse_lazy("admin:staff_staffmember_changelist"),
                    },
                ],
            },
            {
                "title": _("Campaigns"),
                "items": [
                    {
                        "title": _("Campaigns"),
                        "icon": "campaign",
                        "link": reverse_lazy("admin:campaigns_campaign_changelist"),
                    },
                    {
                        "title": _("Participants"),
                        "icon": "trending_up",
                        "link": reverse_lazy(
                            "admin:campaigns_campaignparticipant_changelist"
                        ),
                    },
                    {
                        "title": _("Campaign vouchers"),
                        "icon": "confirmation_number",
                        "link": reverse_lazy(
                            "admin:campaigns_campaignrewardvoucher_changelist"
                        ),
                    },
                    {
                        "title": _("Groups"),
                        "icon": "groups",
                        "link": reverse_lazy("admin:campaigns_group_changelist"),
                    },
                ],
            },
            {
                "title": _("QR, Notifications & Audit"),
                "items": [
                    {
                        "title": _("QR tokens"),
                        "icon": "qr_code_2",
                        "link": reverse_lazy("admin:qr_qrcodetoken_changelist"),
                    },
                    {
                        "title": _("Scan log"),
                        "icon": "barcode_scanner",
                        "link": reverse_lazy("admin:qr_scanlog_changelist"),
                    },
                    {
                        "title": _("Notification log"),
                        "icon": "notifications",
                        "link": reverse_lazy(
                            "admin:notifications_notificationlog_changelist"
                        ),
                    },
                    {
                        "title": _("Admin audit log"),
                        "icon": "history",
                        "link": reverse_lazy(
                            "admin:reporting_adminauditlog_changelist"
                        ),
                    },
                    {
                        "title": _("System config"),
                        "icon": "settings",
                        "link": reverse_lazy(
                            "admin:system_systemconfiguration_changelist"
                        ),
                    },
                ],
            },
            {
                "title": _("Sales leads"),
                "items": [
                    {
                        "title": _("Leads table"),
                        "icon": "table_view",
                        "link": reverse_lazy("leads_page"),
                    },
                    {
                        "title": _("Lead columns"),
                        "icon": "view_column",
                        "link": reverse_lazy("admin:leads_leadcolumn_changelist"),
                    },
                    {
                        "title": _("Lead statuses"),
                        "icon": "flag",
                        "link": reverse_lazy("admin:leads_leadstatus_changelist"),
                    },
                ],
            },
        ],
    },
}

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Serves hashed/compressed static files (admin, DRF) directly from gunicorn.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        # Project-level templates win over app templates (incl. unfold), so our
        # admin/index.html dashboard override is resolved ahead of unfold's.
        "DIRS": [Path(__file__).resolve().parents[2] / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

if os.getenv("DB_ENGINE") == "postgres":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB", "jaqyn"),
            "USER": os.getenv("POSTGRES_USER", "jaqyn"),
            "PASSWORD": os.getenv("POSTGRES_PASSWORD", "jaqyn"),
            "HOST": os.getenv("POSTGRES_HOST", "db"),
            "PORT": os.getenv("POSTGRES_PORT", "5432"),
            # Native psycopg3 connection pool: reuse a bounded set of Postgres
            # connections across requests instead of opening one per request
            # (cuts connect/TLS/auth overhead and caps total server connections,
            # which matters behind a small managed Postgres). Sizes are env-driven
            # so prod can tune to its connection budget. CONN_MAX_AGE must stay 0
            # (Django's requirement when a pool is configured); the pool, not
            # Django, owns connection lifetime.
            "OPTIONS": {
                "pool": {
                    "min_size": int(os.getenv("POSTGRES_POOL_MIN", "1")),
                    "max_size": int(os.getenv("POSTGRES_POOL_MAX", "10")),
                    # Recycle idle connections so a server-side timeout never hands
                    # back a dead one (seconds).
                    "max_idle": int(os.getenv("POSTGRES_POOL_MAX_IDLE", "300")),
                },
            },
            # Validate a pooled connection before use; drop and replace if broken.
            "CONN_HEALTH_CHECKS": True,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_USER_MODEL = "accounts.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "core.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "EXCEPTION_HANDLER": "core.exceptions.envelope_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/min",
        "user": "300/min",
        # --- Campaign write surfaces (apps.campaigns, plan §1.3) ---
        # Every campaign write endpoint is rate-limited via a ScopedRateThrottle so
        # no write surface is unthrottled (backend.md). Authoring is the rarest
        # action; the scan/redeem path is the hottest (a busy till), so it gets the
        # most generous rate.
        "campaign_write": "60/min",  # owner CRUD + lifecycle + voucher cancel
        "campaign_join": "30/min",  # customer join / group start
        "campaign_present": "60/min",  # customer presents a voucher (polled UI)
        "campaign_scan": "120/min",  # staff scan/confirm/redeem at the till
        "loyalty_write": "60/min",  # loyalty setup, join, award, and redemption writes
        "loyalty_scan": "120/min",  # unified till scanner is a high-throughput read
        # Patches write endpoints (mark-seen, board-seen). Infrequent per-session
        # actions; 30/min is generous for UI-driven calls. Source: spec §A writes.
        "patches_write": "30/min",
        "notification_write": "60/min",  # customers acknowledge in-app notices
        # Business brand-asset uploads (logo + cover). Rare, heavy writes; bound
        # tightly so an owner can't hammer the compressor/storage.
        "business_image": "20/min",
        # Owner "Manage Staff" mutations (role change, suspend/reactivate,
        # password reset, remove). Owner-only, low-frequency administrative
        # writes — bounded so credential resets can't be hammered.
        "staff_manage": "30/min",
        # Public landing-page lead submissions (POST /api/businesses/register-lead/).
        # No authentication is required, so the endpoint is open to the internet.
        # 10/min per IP prevents a single source from flooding the admin inbox or
        # creating junk Business rows.
        "business_lead": "10/min",
        # Public pitch-link endpoints — anonymous prospects; generous but capped.
        "pitch": "20/min",
        # --- Auth surfaces (apps.accounts) ---
        # Per-client scoped limits on the anonymous auth endpoints. These sit on
        # top of the service-layer per-identifier limits (issue_otp et al.) and
        # bound what one client (IP) can attempt per minute.
        # Every OTP request costs real money (SMS) or sends an email — tight cap
        # also blunts signup spam.
        "auth_otp_request": "5/min",
        # A 6-digit code has 10^6 combinations; capping verify attempts keeps
        # the brute-force window negligible (on top of the 5-attempt cache cap).
        "auth_otp_verify": "10/min",
        # Password logins — bounds credential-stuffing throughput per client.
        "auth_login": "10/min",
        # Reset codes are emailed; same cost/abuse profile as OTP requests.
        "auth_password_reset": "5/min",
        # Login-method resolve reveals otp-vs-password per identifier — cap
        # enumeration probing while staying generous for normal login UX.
        "auth_resolve": "20/min",
        # Owner business-profile PATCH — routine settings saves, write-bounded.
        "business_me_write": "30/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": True,
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Directory that holds manage.py / config / apps. In the container the code is
# COPYed to /app, so this resolves to /app (writable by appuser); locally it is
# the backend/ dir. BASE_DIR (parents[3]) is the repo root and is NOT writable in
# the container — don't put collected static/media there.
PROJECT_DIR = Path(__file__).resolve().parents[2]

STATIC_URL = "static/"
STATIC_ROOT = PROJECT_DIR / "staticfiles"
# Project-owned static assets (e.g. the admin favicon) live here, in addition to
# each app's own static/ dir which APP_DIRS finders already pick up.
STATICFILES_DIRS = [PROJECT_DIR / "static"]
MEDIA_URL = "/media/"
MEDIA_ROOT = PROJECT_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Media storage. By default writes to the local MEDIA_ROOT (fine for dev). In
# production set USE_S3=true to push user uploads to Cloudflare R2 (S3 API) so
# they persist across container restarts and are served from a CDN-friendly URL.
USE_S3 = os.getenv("USE_S3", "false").lower() == "true"
if USE_S3:
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = os.getenv("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_ENDPOINT_URL = os.getenv(
        "AWS_S3_ENDPOINT_URL"
    )  # R2: https://<acct>.r2.cloudflarestorage.com
    AWS_S3_CUSTOM_DOMAIN = (
        os.getenv("AWS_S3_CUSTOM_DOMAIN") or None
    )  # public bucket / CDN host
    AWS_S3_REGION_NAME = os.getenv("AWS_S3_REGION_NAME", "auto")
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = False
    AWS_S3_FILE_OVERWRITE = False
    STORAGES = {
        "default": {"BACKEND": "storages.backends.s3.S3Storage"},
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        },
    }
    if AWS_S3_CUSTOM_DOMAIN:
        MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/"
else:
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        },
    }

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "IGNORE_EXCEPTIONS": True,
        },
    }
}

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")
CELERY_TASK_ALWAYS_EAGER = (
    os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() == "true"
)

# Public base URL of the customer web app. QR codes encode frontend URLs so a
# phone camera opens the web landing page (not the raw JSON API endpoint).
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")

# --- Email ---
# Console backend is the safe default so non-docker local dev sees emails in
# the terminal without requiring a running SMTP server. Set EMAIL_BACKEND to
# django.core.mail.backends.smtp.EmailBackend + EMAIL_HOST=mailpit (port 1025)
# in .env to get a clickable Mailpit UI instead.
EMAIL_BACKEND = os.getenv(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.getenv("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "1025"))
EMAIL_USE_TLS = _env_bool("EMAIL_USE_TLS")
EMAIL_USE_SSL = _env_bool("EMAIL_USE_SSL")
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
# Socket timeout (seconds) for the SMTP connection. Without it a slow/unreachable
# mail host blocks the worker indefinitely — under CELERY_TASK_ALWAYS_EAGER the
# send runs inside the request, so a hung connect triggers a gunicorn WORKER
# TIMEOUT and kills the worker. A bounded timeout fails fast instead.
EMAIL_TIMEOUT = int(os.getenv("EMAIL_TIMEOUT", "15"))
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "Jaqyn <noreply@mail.jaqyn.kg>")

# Resend (django-anymail) API-based sending. Set EMAIL_BACKEND to
# anymail.backends.resend.EmailBackend + RESEND_API_KEY in .env to send via
# Resend instead of raw SMTP/console.
ANYMAIL = {"RESEND_API_KEY": os.getenv("RESEND_API_KEY", "")}

# Google OAuth Client ID for "Sign in with Google" (GIS ID-token flow). Same
# value is exposed to the frontend as NEXT_PUBLIC_GOOGLE_CLIENT_ID — this one
# is the audience we verify incoming ID tokens against.
GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("DJANGO_CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
# Regex origins (dev): lets ephemeral tunnel hosts (e.g. *.trycloudflare.com) pass
# without re-editing the exact list every time the tunnel URL changes.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r.strip()
    for r in os.getenv("DJANGO_CORS_ALLOWED_ORIGIN_REGEXES", "").split(",")
    if r.strip()
]

OTP_TTL_SECONDS = int(os.getenv("OTP_TTL_SECONDS", "300"))
OTP_RATE_LIMIT_PER_PHONE = int(os.getenv("OTP_RATE_LIMIT_PER_PHONE", "5"))
OTP_RATE_LIMIT_PER_IP = int(os.getenv("OTP_RATE_LIMIT_PER_IP", "20"))
COLLECT_DAILY_LIMIT = int(os.getenv("COLLECT_DAILY_LIMIT", "1"))
COLLECT_MIN_INTERVAL_SECONDS = int(os.getenv("COLLECT_MIN_INTERVAL_SECONDS", "21600"))
REWARD_PRESENT_TTL_SECONDS = int(os.getenv("REWARD_PRESENT_TTL_SECONDS", "120"))

# --- Dev/test helpers — DO NOT enable in production ---
# When set, this fixed code is accepted by verify_otp for ANY phone (bypasses the
# real OTP). Lets static seeded test clients log in without reading the dev log.
DEV_LOGIN_OTP = os.getenv("DEV_LOGIN_OTP", "").strip()
# Static test accounts seeded on startup (entrypoint runs seed_test_users when true).
SEED_TEST_USERS = os.getenv("SEED_TEST_USERS", "false").lower() == "true"
SEED_TEST_CLIENT_COUNT = int(os.getenv("SEED_TEST_CLIENT_COUNT", "3"))
SEED_TEST_BUSINESS_CODE = os.getenv("SEED_TEST_BUSINESS_CODE", "TESTCAFE")
# Shared password for every seeded test account (email+password fallback login).
SEED_TEST_PASSWORD = os.getenv("SEED_TEST_PASSWORD", "password")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "jsonish": {
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "jsonish",
        }
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}

if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(dsn=os.getenv("SENTRY_DSN"), traces_sample_rate=0.1)
