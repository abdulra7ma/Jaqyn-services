---
title: Backend Docs
service: backend
type: overview
status: active
last_reviewed: 2026-06-30---

# Backend Docs

Developer reference for the Jaqyn Django/DRF backend (`backend/`). Every claim
here is derived from the code; uncertain items are marked `TODO`.

- [overview.md](overview.md) — stack and the apps at a glance
- [architecture.md](architecture.md) — layering, service/exception pattern, request flow
- [api.md](api.md) — REST surface grouped by app
- [data-model.md](data-model.md) — canonical model/schema reference
- [configuration.md](configuration.md) — settings layout and env vars
- [runbook.md](runbook.md) — run, migrate, test, Celery, deploy
- [apps/](apps/) — per-app stubs for apps with non-trivial logic

See root `docs/INDEX.md` for the full doc map. (`TODO`: `docs/INDEX.md` does not
yet exist in the repo.)
