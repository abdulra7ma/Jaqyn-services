---
title: Repository Structure
service: shared
type: reference
status: active
last_reviewed: 2026-06-30
---

# Repository Structure

Actual current layout of the Jaqyn monorepo. Three deployables — `backend/`
(Django/DRF), `frontend/` (Next.js pnpm+turbo), `landing/` (Vite) — all deployed
to Railway (see `DEPLOY.md`).

```
Jaqyn-services/
├── README.md                  # repo overview, quickstart
├── AGENTS.md                  # agent guide + rule-doc map (authoritative)
├── CLAUDE.md                  # pointer to AGENTS.md
├── DEPLOY.md                  # Railway deploy (all services)
├── docker-compose.yml         # dev orchestration
├── docker-compose.prod.yml    # prod overrides
├── Makefile                   # make up / migrate / test / lint
├── .env.example
├── nginx/                     # reverse proxy config
├── docs/                      # cross-cutting docs (see docs/INDEX.md)
│   ├── README.md, INDEX.md
│   ├── conventions/  schemas/  contracts/  guides/  architecture/
│   ├── qa/  specs/            # QA reports + active plans
│   ├── design-system.md       # UI source of truth
│   └── _archive/              # shipped plans + design deck (deprecated)
├── tasks/                     # trackers ONLY (B*/F*/CHECKPOINT) + _local/
│
├── backend/                   # Django 5 + DRF (docs in backend/docs/)
│   ├── Dockerfile, entrypoint.sh
│   ├── railway.json, railway.worker.json   # Railway service configs
│   ├── manage.py, conftest.py, pytest.ini
│   ├── requirements/          # base.txt / dev.txt / prod.txt
│   ├── config/                # Django project
│   │   ├── settings/          # base.py / dev.py / prod.py / test.py
│   │   ├── urls.py, celery.py, wsgi.py, asgi.py
│   ├── core/                  # cross-cutting (no business models)
│   │   ├── response.py exceptions.py permissions.py pagination.py
│   │   ├── throttling.py ratelimit.py qr.py logging.py fields.py
│   │   ├── frontend.py images.py views.py
│   ├── ops/                   # operational scripts
│   └── apps/                  # 9 domain apps
│       ├── accounts/          # User, CustomerProfile, OTP, auth/JWT
│       ├── businesses/        # Business, registration, approval, dashboard
│       ├── campaigns/         # unified Campaign (Individual/Group/Social) + groups + vouchers
│       ├── loyalty/           # LoyaltyProgram, Membership, Transaction, Voucher
│       ├── qr/                # QRCodeToken, ApprovalCode, ScanLog
│       ├── staff/             # StaffMember, staff endpoints
│       ├── reporting/         # aggregations, AdminAuditLog
│       ├── notifications/     # NotificationPreference, NotificationLog
│       └── system/            # health/config
│   # Larger apps split urls by audience (business_urls / customer_urls /
│   # staff_urls / admin_urls) and use services/ + views/ packages.
│
├── frontend/                  # Next.js monorepo (pnpm + turbo; docs in frontend/docs/)
│   ├── package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json
│   ├── apps/
│   │   └── web/               # ONE Next 14 App Router app, role-routed
│   │       └── app/           # /(customer)  /business  /staff  + /q /c /collect /scan …
│   └── packages/
│       ├── api/               # TanStack Query keys/hooks/types, live+mock adapters
│       ├── ui/                # shared visual primitives (@jaqyn/ui)
│       ├── i18n/              # EN + RU copy (@jaqyn/i18n)
│       └── config/            # eslint/tsconfig/tailwind preset incl. design tokens
│
└── landing/                   # Vite + React + TS marketing site (docs in landing/docs/)
```

## Key conventions

- **One app per bounded domain.** Business logic lives in each app's `services/`,
  views stay thin (parse → call service → envelope). See `docs/conventions/CONVENTIONS.md`.
- **Single frontend app.** `frontend/apps/web` serves all three audiences via
  App Router segments and role-based routing — not three separate apps.
- **Append-only ledgers** (loyalty transactions, ScanLog) are never mutated;
  corrections add rows.
- **Settings split** (base/dev/prod/test); secrets only via env.
- **Per-service docs** are canonical for each deployable: `backend/docs/`,
  `frontend/docs/`, `landing/docs/`. This file is the repo-wide map; for models
  see `backend/docs/data-model.md`, for routes see `backend/docs/api.md`.

> Historical note: `groups/` was merged into `campaigns/` and `loyalty/` was
> split back out of `campaigns/` — see `docs/_archive/` for the shipped plans.
