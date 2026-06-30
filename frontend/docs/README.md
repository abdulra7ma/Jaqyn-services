---
title: Frontend Docs
service: frontend
type: overview
status: active
last_reviewed: 2026-06-30---

# Frontend Docs

The `frontend/` pnpm + turbo monorepo: one Next.js 14 App Router app
(`apps/web`, role-routed for customer/business/staff) plus four shared packages
(`packages/{api,config,i18n,ui}`).

## Docs in this folder

- [overview.md](./overview.md) — stack, the single-app + role-routing model, the four packages.
- [architecture.md](./architecture.md) — server vs client components, data fetching, package composition.
- [packages.md](./packages.md) — public surface of `api`, `config`, `i18n`, `ui`.
- [state.md](./state.md) — server state (TanStack Query) vs UI state vs context.
- [routing.md](./routing.md) — the App Router route map and the login/role redirects.

Rules of record (always apply when editing): `.claude/rules/frontend.md` and
`docs/design-system.md`.

See also the repo-wide `docs/INDEX.md`.
