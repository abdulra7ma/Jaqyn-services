---
title: Frontend Overview
service: frontend
type: overview
status: active
last_reviewed: 2026-06-30---

# Frontend Overview

## Stack

- **pnpm workspaces + Turbo** — `frontend/package.json` (`packageManager: pnpm@9.1.0`),
  `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `turbo.json` (tasks: `build`,
  `dev`, `lint`, `typecheck`, `test`).
- **Next.js 14** (App Router), **React 18**, **TypeScript 5** (`strict`).
  See `apps/web/package.json`.
- **TanStack Query 5** for server state (`@tanstack/react-query` ^5.45).
- **Tailwind 3** with the shared preset in `@jaqyn/config`.
- Notable app deps: `framer-motion`, `html5-qrcode` + `react-qr-code` (QR),
  `@googlemaps/markerclusterer` (nearby map), `html-to-image`.

## One app, role-routed

There is a **single** Next app, `apps/web`, not three apps. Roles share the app
and are separated by URL prefix:

- **Customer** — root `/` and most segments (`/nearby`, `/loyalty`,
  `/campaigns`, `/profile`, …).
- **Business** — `/business/*`.
- **Staff** — `/staff/*`.

The root `app/layout.tsx` is the customer area; `/business` and `/staff` have
their own segment layouts. Auth is unified at `/login`; the per-role login
routes redirect into it (see [routing.md](./routing.md)).

> The root-level `frontend/package.json` exposes `dev:customer`,
> `dev:business`, `dev:staff` scripts that filter on package names
> `customer` / `business` / `staff`, but no workspace packages with those
> names exist. **TODO:** stale scripts — the only app is `web`
> (`pnpm --filter web dev`).

## The four shared packages

- **`@jaqyn/api`** — TanStack Query keys + hooks + types, with a per-domain
  live API object built on a shared fetch client. (customer / business / staff /
  loyalty domains.)
- **`@jaqyn/config`** — shared Tailwind preset (design tokens) and PostCSS
  config. Consumed by the app's Tailwind/PostCSS setup.
- **`@jaqyn/i18n`** — EN + RU copy, `I18nProvider`, `useT`, `LanguageSwitch`.
- **`@jaqyn/ui`** — shared UI primitives (Button, Input, Card, Badge,
  ProgressBar, Sheet, Dialog, AlertDialog, states, `cn`).

Details in [packages.md](./packages.md).
