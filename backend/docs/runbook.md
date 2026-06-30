---
title: Backend Runbook
service: backend
type: runbook
status: active
last_reviewed: 2026-06-30---

# Backend Runbook

## Local stack (Docker)

`docker-compose.yml` (repo root) defines `web`, `worker`, `beat`, `mailpit`,
`frontend`, `db` (postgres:16), `redis`. Web runs `manage.py runserver` on
`:8000`. Mailpit UI on `:8025`, SMTP on `:1025`.

```bash
make up        # docker compose up --build
make down      # docker compose down
```

Combined backend (Docker) + frontend (Next dev) Make targets:

```bash
make dev-local   # backend containers + frontend on localhost
make dev         # same, reachable from phone over LAN
make dev-lan     # LAN over HTTPS (mkcert) — camera/QR need a secure origin
make dev-https   # HTTPS via cloudflared tunnel
make dev-stop / make dev-local-stop
```

> Note (from project memory): the live `:8000` backend in this setup is the
> Docker stack with its own Postgres — run migrations against the container, not
> a local shell, to hit the right DB.

## Migrations

```bash
make makemigrations          # manage.py makemigrations
make migrate                 # manage.py migrate   (local shell)
# in Docker:
docker compose exec web python manage.py migrate
```

`entrypoint.sh` waits for Postgres, then runs `migrate` when
`RUN_MIGRATIONS=true` (default), `seed_test_users` when `SEED_TEST_USERS=true`,
and `collectstatic` when `DJANGO_COLLECTSTATIC=true`. `worker`/`beat` set
`RUN_MIGRATIONS=false` so only `web` migrates.

## Tests

```bash
make test                    # cd backend && pytest
```

Uses `config.settings.test` (in-memory SQLite, eager Celery — `pytest.ini`,
`config/settings/test.py`).

## Seed data

```bash
python manage.py seed_test_users [--clients N]   # idempotent
python manage.py seed_demo
python manage.py seed_business_types
python manage.py create_demo_invite
```

`seed_test_users` creates clients (`+99670000####`), one staff
(`+996700000800`), one owner (`+996700000900`) + business
(`SEED_TEST_BUSINESS_CODE`). Login via phone + `DEV_LOGIN_OTP`, or email +
`SEED_TEST_PASSWORD`. Tuned by the `SEED_TEST_*` / `DEV_LOGIN_OTP` env vars.

## Celery

```bash
celery -A config worker -l info
celery -A config beat -l info
```

Beat schedule (`config/celery.py`): rotate approval codes (daily), expire old
groups / campaign vouchers (hourly), transition campaign lifecycle (15 min),
sweep campaign fraud (hourly), notify vouchers-expiring / campaigns-ending
(hourly). In dev/test `CELERY_TASK_ALWAYS_EAGER` runs tasks inline.

## Lint / type / hygiene

```bash
make lint        # manage.py check
# Per backend rules: ruff + mypy via pre-commit (config in pyproject.toml).
```

## Deploy — Railway (all services)

Per `DEPLOY.md`: backend web, Celery worker, Celery beat, Postgres, and Redis
all run on **Railway**; media on Cloudflare R2 (`USE_S3=true`). Railway service
configs: `backend/railway.json` (web) and `backend/railway.worker.json`
(worker/beat). Production uses `config.settings.prod` (`DEBUG=False`, HTTPS
hardening, WhiteNoise). Set the prod env vars from `configuration.md` /
`.env.prod.example`. (`TODO`: confirm exact start commands in the Railway
configs.)
