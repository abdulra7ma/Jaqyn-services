# B00 — Project Setup & Infra

Phase: 0 · Scope: Sprint 1 · Depends on: none

## Goal
Runnable Django+DRF backend with Postgres, Redis, Celery via Docker Compose, plus
the shared API response envelope and a health check.

## References
- Folder layout to create: `_shared/STRUCTURE.md` → `backend/` section
  (config/ settings split, core/, apps/, requirements/).
- Images & services: `_shared/DOCKER.md` (build backend image once; reuse for
  web/worker/beat; pull postgres/redis/nginx).

## Backend folder to scaffold  (from STRUCTURE.md)
```
backend/
├── Dockerfile  entrypoint.sh  manage.py  pytest.ini  conftest.py
├── requirements/ base.txt dev.txt prod.txt
├── config/   settings/{base,dev,prod,test}.py  urls.py  celery.py  wsgi.py asgi.py
├── core/     response.py exceptions.py permissions.py pagination.py throttling.py
│             ratelimit.py qr.py logging.py fields.py  tests/
└── apps/     accounts/ businesses/ staff/ qr/ loyalty/ groups/ reporting/ notifications/
```
Create empty apps now (accounts only needs models for the custom user before first
migration); the rest get filled by B01–B11.

## Docker images for THIS project  (see DOCKER.md)
- **Build:** `backend` image (`python:3.11-slim`, multi-stage, non-root) — used by
  `web`, `worker`, `beat` (same image, different command).
- **Pull:** `postgres:16-alpine` (`db`), `redis:7-alpine` (`redis`),
  `nginx:1.27-alpine` (prod only).

## Tasks
- Django project `jaqyn` + apps: `accounts`, `businesses`, `staff`, `qr`,
  `loyalty`, `groups`, `core` (shared: envelope, permissions, logging).
- `requirements.txt`: django, djangorestframework, djangorestframework-simplejwt,
  psycopg[binary], celery, redis, django-redis, django-cors-headers,
  django-filter, pillow, qrcode, sentry-sdk, python-dotenv, gunicorn.
- Settings split: `base/dev/prod` (env via `.env`, document in `.env.example`).
- Custom user model wired BEFORE first migration (`AUTH_USER_MODEL=accounts.User`).
- DRF defaults: JWT auth, `IsAuthenticated`, custom exception handler (envelope),
  pagination, throttling.
- Celery app + beat schedule stub. Redis as broker + result backend + cache.
- `docker-compose.yml`: services `web`, `db` (postgres), `redis`, `worker`
  (celery), `beat` (celery beat), `nginx` (prod). Volumes for db + media.
- `Dockerfile`, `entrypoint.sh` (migrate + collectstatic + run).
- Sentry init (no-op if DSN unset). Structured logging config.
- `GET /api/health/` → `{status, db, redis}`.

## Definition of Done
- `docker compose up` boots web+db+redis+worker+beat clean.
- `/api/health/` returns `success:true` with db+redis ok.
- A throwaway error returns the error envelope (not raw DRF JSON).
- `.env.example` documents every env var.
- README: how to run locally.

## Acceptance (TBD Phase 0)
- Backend runs locally · Postgres+Redis run locally · health check works.

## Checkpoint update
Set B00 = DONE, note compose status + health output.
