---
title: Backend Configuration
service: backend
type: reference
status: active
last_reviewed: 2026-07-05---

# Backend Configuration

## Settings layout (`backend/config/settings/`)

- `base.py` — shared settings; reads everything from env vars.
- `dev.py` — `DEBUG=True`, `CELERY_TASK_ALWAYS_EAGER=True`.
- `prod.py` — `DEBUG=False`, HTTPS/HSTS hardening, WhiteNoise manifest static
  storage, CSRF trusted origins, **fail-fast guards** (`ImproperlyConfigured` if
  `DEV_LOGIN_OTP` is set or `EMAIL_BACKEND` is the console backend).
- `test.py` — in-memory SQLite, MD5 password hasher, eager Celery, locmem cache.

`pytest.ini` uses `config.settings.test`. `config/celery.py` defaults to
`config.settings.dev`. The runtime module is chosen by `DJANGO_SETTINGS_MODULE`.

## Key defaults

- `DEBUG` — default **False** (`DJANGO_DEBUG`, `base.py`); `dev.py` forces True.
- `USE_TZ=True`, `TIME_ZONE=UTC` (`base.py`).
- DRF: `PAGE_SIZE=25`, default `IsAuthenticated` + JWT, anon `100/min` / user
  `300/min` plus named write scopes (`base.py`).
- JWT: 30 min access / 14 day refresh, blacklist after rotation (`SIMPLE_JWT`).

## Environment variables

Read in `base.py` unless noted. No `.env` is committed; `.env.example` /
`.env.prod.example` at repo root are templates.

### Core (have safe dev defaults; **set real values in prod**)
| Var | Default | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY` | `unsafe-dev-secret` | Must override in prod |
| `DJANGO_DEBUG` | `false` | |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | comma-separated |
| `DJANGO_CORS_ALLOWED_ORIGINS` | empty | comma-separated |
| `DJANGO_CORS_ALLOWED_ORIGIN_REGEXES` | empty | dev tunnels |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | empty | prod only (`prod.py`) |
| `FRONTEND_URL` | `http://localhost:3000` | QR codes encode this |

### Database
`DB_ENGINE=postgres` switches to Postgres (else SQLite at repo root). When
Postgres: `POSTGRES_DB/USER/PASSWORD` (default `jaqyn`), `POSTGRES_HOST`
(`db`), `POSTGRES_PORT` (`5432`), pool `POSTGRES_POOL_MIN/MAX/MAX_IDLE`.

### Redis / Celery
`REDIS_URL` (`redis://localhost:6379/0`), `CELERY_BROKER_URL` (`…/1`),
`CELERY_RESULT_BACKEND` (`…/2`), `CELERY_TASK_ALWAYS_EAGER` (`false`).

### Email
Prod sends via **Resend** (`django-anymail`), API-based, not SMTP. Local dev
defaults to the console backend; Mailpit (SMTP) is also available for a
clickable UI.

- `EMAIL_BACKEND` (default console — **prod rejects console**, `prod.py`
  fail-fast). Prod value: `anymail.backends.resend.EmailBackend`.
- `RESEND_API_KEY` — read into `ANYMAIL["RESEND_API_KEY"]` (`base.py`); only
  used when `EMAIL_BACKEND` is the Resend backend.
- `DEFAULT_FROM_EMAIL` (default `Jaqyn <noreply@mail.jaqyn.kg>`) — must be on a
  domain verified in the Resend dashboard (SPF/DKIM/DMARC DNS records).
- SMTP fallback vars (Mailpit locally, or another SMTP provider): `EMAIL_HOST`
  (`localhost`), `EMAIL_PORT` (`1025`), `EMAIL_USE_TLS`/`EMAIL_USE_SSL` (bool,
  accept on/1/yes/true), `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`,
  `EMAIL_TIMEOUT` (`15`).
- Email-sending Celery tasks: `apps/accounts/tasks.py`,
  `apps/businesses/tasks.py` — run in the **worker** process, so email vars
  must be set there too, not just on the web service.

### Media / R2
`USE_S3` (`false`). When true: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_STORAGE_BUCKET_NAME`, `AWS_S3_ENDPOINT_URL` (R2), `AWS_S3_CUSTOM_DOMAIN`,
`AWS_S3_REGION_NAME` (`auto`).

### Static (prod)
`DJANGO_COLLECTSTATIC` (entrypoint runs collectstatic when true),
`SECURE_SSL_REDIRECT` (`true`), `SECURE_HSTS_SECONDS` (`31536000`).

### OTP / scan tuning
`OTP_TTL_SECONDS` (300), `OTP_RATE_LIMIT_PER_PHONE` (5), `OTP_RATE_LIMIT_PER_IP`
(20), `APPROVAL_CODE_FAILED_LIMIT` (10), `COLLECT_DAILY_LIMIT` (1),
`COLLECT_MIN_INTERVAL_SECONDS` (21600), `REWARD_PRESENT_TTL_SECONDS` (120).

### Dev/test helpers — **never set in prod**
`DEV_LOGIN_OTP` (fixed OTP accepted for any phone; prod raises if set),
`SEED_TEST_USERS` (`false`), `SEED_TEST_CLIENT_COUNT` (3),
`SEED_TEST_BUSINESS_CODE` (`TESTCAFE`), `SEED_TEST_PASSWORD` (`password`).

### Observability
`SENTRY_DSN` — when set, Sentry is initialized (`traces_sample_rate=0.1`).

> Fail-fast note: `prod.py` enforces a few invariants at boot, but most core
> vars fall back to dev defaults rather than raising. `TODO`: the backend rule
> "a missing required env var raises on startup" is only partially implemented.
