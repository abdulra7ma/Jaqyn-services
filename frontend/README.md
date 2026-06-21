# Jaqyn Frontend

Next.js (App Router) monorepo — **pnpm workspaces + Turborepo**. Three mobile-first
PWA areas served by **one Next router, deployed as one container**.

```
apps/
  web/                    single Next app + container (port 3000)
    app/                  /          customer area (public QR-scan entry)
    app/business/         /business  merchant dashboard area
    app/staff/            /staff     staff area (camera scanner added in F03)
    public/manifest.json            customer PWA (scope /)
    public/business/manifest.json   business PWA (scope /business)
    public/staff/manifest.json      staff PWA   (scope /staff)
packages/
  api/        typed client, envelope unwrap, JWT refresh, TanStack Query hooks
  ui/         Button, Input, Loading/Empty/Error states
  i18n/       ru / en (ky later), LanguageSwitch, localStorage-persisted
  config/     shared Tailwind preset + PostCSS
```

The three areas are distinct products (different audience, entry, PWA identity)
but share one router and one runtime. Each area has its own `manifest.json` with a
scoped `start_url`, so each installs as a separate home-screen app from one origin.
Role enforcement is backend-side (JWT + DRF permissions), not client routing.

## Develop

```bash
pnpm install
cp .env.example .env            # NEXT_PUBLIC_API_URL=http://localhost:8000
pnpm dev                        # http://localhost:3000  (/, /business, /staff)
pnpm typecheck && pnpm lint
```

Each area calls `GET /api/health/` via the shared client, renders
loading/empty/error states, and toggles RU/EN.

## Docker

One multi-stage `Dockerfile` → one `frontend` service (see `../docker-compose.yml`).
`dev` target hot-reloads via bind mount; `runner` target serves Next standalone.
