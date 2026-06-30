---
title: Landing Runbook
service: landing
type: runbook
status: active
last_reviewed: 2026-06-30---

# Landing Runbook

Standalone Vite app in `landing/`. Not part of the pnpm/turbo `frontend/`
workspace — run it from `landing/`.

## Commands

From `landing/` (scripts in `landing/package.json`):

```bash
npm install      # install deps
npm run dev      # vite dev server (default http://localhost:5173)
npm run build    # tsc -b && vite build  → dist/
npm run preview  # serve the built dist/ locally
```

> Package manager: `package.json` declares no `packageManager` field; examples
> use npm. **TODO:** confirm whether the team uses pnpm here.

## Env

- `VITE_APP_URL` — base URL of the live `frontend/` app the CTAs link to
  (default `http://localhost:3000`). Set to the deployed app host in prod.
- API base for lead submission — see `src/api.ts`.

## Deploy

All Jaqyn services deploy to **Railway** (backend, Celery, Postgres, Redis,
frontend, and this landing site). There is no Vercel in the deploy target.
Build artifact is the static `dist/` from `vite build`. See repo `DEPLOY.md`
for the per-service Railway setup.
