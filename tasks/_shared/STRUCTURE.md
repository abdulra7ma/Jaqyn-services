# Project Folder Structure

Target layout for the whole repo. Designed to scale: domain-driven Django apps
(each app owns its models/serializers/views/services/tasks/tests), settings split
by env, a thin `core` for cross-cutting concerns, and a Next.js monorepo with
shared packages. Build it incrementally — create an app/package only when its task
starts, but keep these names so paths in the task files resolve.

```
Jaqyn-services/
├── README.md                      # repo overview, quickstart, links to tasks/
├── docker-compose.yml             # dev orchestration (see DOCKER.md)
├── docker-compose.prod.yml        # prod overrides (nginx, gunicorn, no code mount)
├── .env.example                   # every env var documented
├── .gitignore
├── Makefile                       # make up / migrate / test / lint shortcuts
├── tasks/                         # THIS planning folder
│
├── backend/                       # Django + DRF project
│   ├── Dockerfile
│   ├── entrypoint.sh              # wait-for-db → migrate → collectstatic → run
│   ├── requirements/
│   │   ├── base.txt               # shared deps
│   │   ├── dev.txt                # base + debug/test tooling
│   │   └── prod.txt               # base + gunicorn/sentry
│   ├── manage.py
│   ├── pytest.ini
│   ├── conftest.py
│   ├── config/                    # the Django "project" (renamed from default)
│   │   ├── __init__.py            # loads celery app
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── dev.py
│   │   │   ├── prod.py
│   │   │   └── test.py
│   │   ├── urls.py                # includes each app's urls under /api/
│   │   ├── celery.py              # Celery app + beat schedule
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── core/                      # cross-cutting, no business models
│   │   ├── response.py            # success/error envelope helpers
│   │   ├── exceptions.py          # DRF custom exception handler → envelope
│   │   ├── permissions.py         # IsCustomer / IsStaff / IsBusinessOwner / IsAdmin
│   │   ├── pagination.py
│   │   ├── throttling.py          # OTP / code-attempt throttles
│   │   ├── ratelimit.py           # Redis counter helpers
│   │   ├── qr.py                  # token generation + PNG render
│   │   ├── logging.py             # ScanLog + analytics-event helpers
│   │   ├── fields.py              # UUIDPrimaryKey, TimeStamped base models
│   │   └── tests/
│   └── apps/
│       ├── accounts/              # User, CustomerProfile, OTP, auth
│       │   ├── models.py
│       │   ├── serializers.py
│       │   ├── views.py
│       │   ├── urls.py
│       │   ├── services.py        # OTP issue/verify, JWT issue — business logic
│       │   ├── permissions.py     # app-specific if any
│       │   ├── admin.py
│       │   ├── tasks.py           # send_otp
│       │   ├── migrations/
│       │   └── tests/
│       ├── businesses/            # Business, registration, approval, dashboard
│       ├── staff/                 # StaffMember, staff login, today-code, activity
│       ├── qr/                    # QRCodeToken, ApprovalCode, resolve/collect/checkin
│       ├── loyalty/               # RewardProgram, CustomerRewardProgress,
│       │                          #   RewardTransaction, RewardRedemption
│       ├── groups/                # GroupOffer, GroupDeal, GroupMember, check-in
│       ├── reporting/             # aggregations, weekly report task
│       └── notifications/         # Notifier abstraction, channels, prefs
│   # every app mirrors accounts/'s file set (models/serializers/views/urls/
│   # services/admin/tasks/migrations/tests). Keep business logic in services.py,
│   # not views — keeps views thin and logic unit-testable.
│
├── frontend/                      # Next.js monorepo (pnpm workspaces + turbo)
│   ├── package.json               # workspaces: apps/*, packages/*
│   ├── pnpm-workspace.yaml
│   ├── turbo.json
│   ├── Dockerfile                 # multi-stage, build-arg APP=customer|business|staff
│   ├── tsconfig.base.json
│   ├── apps/
│   │   ├── customer/              # PWA  (Next.js App Router)
│   │   │   ├── app/               # routes: /q/[token], /login, /rewards, /groups…
│   │   │   ├── components/
│   │   │   ├── public/manifest.json + icons
│   │   │   ├── next.config.js (PWA/service worker)
│   │   │   └── package.json
│   │   ├── business/             # dashboard (same shape)
│   │   └── staff/                # PWA + camera scanner
│   └── packages/
│       ├── api/                   # typed client, envelope unwrap, JWT refresh, hooks
│       ├── ui/                    # buttons, inputs, Loading/Empty/Error states
│       ├── i18n/                  # ru / en (ky later)
│       └── config/                # shared eslint/tsconfig/tailwind preset
│
├── nginx/
│   ├── nginx.conf                 # reverse proxy: /api → backend, / → frontend
│   └── certs/                     # SSL (mounted; not committed)
│
├── ops/
│   ├── backup/backup.sh           # daily pg_dump + media tar
│   ├── backup/restore.md          # documented restore process
│   └── monitoring/                # sentry notes, alert rules
│
└── docs/
    ├── architecture.md            # system overview, the two core loops
    ├── api.md                     # generated/maintained from drf-spectacular
    ├── runbook.md                 # deploy, rotate secrets, on-call
    └── decisions/                 # ADRs (one md per significant decision)
```

## Scalability conventions
- **One app per bounded domain.** New feature → new app or new service in an
  existing app, never a god-module.
- **services.py holds logic**, views stay thin (parse → call service → envelope).
  Makes logic reusable from Celery tasks, admin actions, and tests.
- **Append-only ledgers** (RewardTransaction, ScanLog) never mutated — corrections
  add rows. Keeps audit + fraud analysis sound at scale.
- **Settings split** so dev/prod/test diverge safely; secrets only via env.
- **Frontend shared packages** (`api`, `ui`, `i18n`) prevent duplication across the
  three apps; each app stays a thin composition layer.
- **Stateless web/worker** — all shared state in Postgres/Redis so you can scale
  containers horizontally behind nginx.
- **docs/decisions/** ADRs capture the "why" so the structure survives team growth.
