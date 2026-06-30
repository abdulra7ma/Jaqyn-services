---
title: Docker — Images & Services
service: shared
type: guide
status: active
last_reviewed: 2026-06-30
---
# Docker — Images & Services

One stack, two compose files: `docker-compose.yml` (dev) and
`docker-compose.prod.yml` (overrides). Below: every service, the image it uses,
the base it's built from, and why it exists. "Built" = our Dockerfile; "Pulled" =
official image used as-is.

---

## Services overview

| Service   | Image / base                       | Built/Pulled | Purpose |
|-----------|------------------------------------|:------------:|---------|
| `web`     | `backend/Dockerfile` → `python:3.11-slim` | Built  | Django API (dev: runserver, prod: gunicorn) |
| `worker`  | same image as `web`                | Built (reused)| Celery worker — OTP, notifications, async events |
| `beat`    | same image as `web`                | Built (reused)| Celery beat — daily code rotation, expiries, weekly reports |
| `db`      | `postgres:16-alpine`               | Pulled       | PostgreSQL primary datastore |
| `redis`   | `redis:7-alpine`                   | Pulled       | Broker + result backend + cache + rate-limit counters |
| `customer`| `frontend/Dockerfile` (APP=customer) | Built      | Next.js Customer PWA |
| `business`| `frontend/Dockerfile` (APP=business) | Built      | Next.js Business dashboard |
| `staff`   | `frontend/Dockerfile` (APP=staff)  | Built        | Next.js Staff PWA |
| `nginx`   | `nginx:1.27-alpine`                | Pulled (+conf)| Reverse proxy + TLS termination (prod) |

`web`, `worker`, `beat` share ONE built image — same code, different command. Don't
build three. Same for the frontend: ONE multi-stage Dockerfile, `APP` build-arg
selects which workspace app to build.

---

## Backend image  (`backend/Dockerfile`)

- **Base:** `python:3.11-slim` (small; add only needed apt libs: `libpq5`,
  build deps in a builder stage then dropped).
- **Pattern:** multi-stage — `builder` installs wheels into a venv, final stage
  copies the venv → small runtime image, runs as non-root user.
- **Installs:** `requirements/prod.txt` (or `dev.txt` in dev via build target).
- **Entrypoint:** `entrypoint.sh` → wait-for-db → `migrate` → `collectstatic`
  (prod) → exec the service command.
- **Commands per service:**
  - `web` dev: `python manage.py runserver 0.0.0.0:8000`
  - `web` prod: `gunicorn config.wsgi --bind 0.0.0.0:8000 --workers 3`
  - `worker`: `celery -A config worker -l info`
  - `beat`: `celery -A config beat -l info`
- **Why slim + multi-stage:** fast deploys, small attack surface, no compiler in
  the runtime image.

## Frontend image  (`frontend/Dockerfile`)

- **Base:** `node:20-alpine` (build) → `node:20-alpine` runner (Next standalone).
- **Pattern:** multi-stage with `ARG APP` (customer|business|staff):
  `deps` (pnpm install workspace) → `builder` (`pnpm --filter $APP build`) →
  `runner` (copies `.next/standalone` + static, runs `node server.js`).
- **Why one Dockerfile, build-arg APP:** three apps, one recipe; shared packages
  (`api`/`ui`/`i18n`) built once in the workspace install.
- **Dev option:** can run apps with `next dev` via a `dev` target + bind mount for
  hot reload instead of the standalone runner.

## Pulled images (no Dockerfile)

- **`postgres:16-alpine`** — `db`. Env: `POSTGRES_DB/USER/PASSWORD`. Named volume
  `pgdata` for persistence. Alpine = small.
- **`redis:7-alpine`** — `redis`. `appendonly yes` in prod for durability. Used as
  Celery broker/backend, Django cache, and Redis-counter rate limiting.
- **`nginx:1.27-alpine`** — `nginx`. Mounts `nginx/nginx.conf` + `certs/`. Routes
  `/api` → `web`, app hosts → `customer`/`business`/`staff`, serves media/static.

---

## Volumes
- `pgdata` → Postgres data (persist across restarts).
- `media` → uploaded logos/covers (shared web↔nginx; object storage later).
- `static` → collected static (prod, served by nginx).
- `redisdata` → Redis AOF (prod).

## Networks
Single bridge network; services reach each other by name (`db`, `redis`, `web`).
Only `nginx` (prod) / app ports (dev) published to host.

## Dev vs Prod
- **Dev** (`docker-compose.yml`): code bind-mounts for hot reload, `runserver` +
  `next dev`, Postgres/Redis ports exposed, no nginx required.
- **Prod** (`docker-compose.prod.yml`): no source mounts, gunicorn + Next
  standalone, nginx + TLS, restart policies, healthchecks, Sentry DSN set,
  resource limits.

## Healthchecks (prod)
- `web`: `GET /api/health/` · `db`: `pg_isready` · `redis`: `redis-cli ping` ·
  frontend apps: `GET /` 200. `worker`/`beat`: `celery inspect ping`.

## Minimum image set to remember
Build **2** images total (backend, frontend) + pull **3** (postgres, redis, nginx).
Everything else is the same image run with a different command or build-arg.
