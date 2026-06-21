# F00 — Frontend Setup

Phase: 0 · Scope: later (after backend core) · Depends on: B00

## Goal
Next.js monorepo with three PWAs sharing an API client + UI kit. Mobile-first,
no mandatory app install, RU/EN i18n.

## References
- Full layout: `_shared/STRUCTURE.md` → `frontend/` section.
- Images & build-arg pattern: `_shared/DOCKER.md` → Frontend image.

## Structure  (from STRUCTURE.md)
```
frontend/                         pnpm workspaces + turbo
├── package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
├── Dockerfile                    multi-stage, ARG APP=customer|business|staff
├── apps/
│   ├── customer/   app/ components/ public/manifest.json next.config.js package.json
│   ├── business/   (same shape)
│   └── staff/      (same shape, + camera scanner)
└── packages/
    ├── api/        typed client, envelope unwrap, JWT refresh, query hooks
    ├── ui/         buttons, inputs, Loading/Empty/Error states
    ├── i18n/       ru / en (ky later)
    └── config/     shared eslint / tsconfig / tailwind preset
```
Tooling: Next.js (App Router) + TypeScript + Tailwind + TanStack Query + a small
form lib. PWA via manifest + service worker. Shared `.env` for `NEXT_PUBLIC_API_URL`.

## Docker images for THIS project  (see DOCKER.md)
- **Build:** ONE `frontend` image (`node:20-alpine`, multi-stage Next standalone).
  `ARG APP` selects the workspace app → three compose services (`customer`,
  `business`, `staff`) from the same Dockerfile.
- Shared packages (`api`/`ui`/`i18n`) build once during the workspace install.

## Cross-cutting requirements (TBD §16, §22)
- Mobile-first, responsive, fast, works Android Chrome + iPhone Safari.
- Every screen has loading + empty + error states.
- API client maps backend error `code` → localized message.
- Auth: store JWT, refresh on 401, redirect to login preserving return URL.
- Share links: Copy / WhatsApp / Telegram / Instagram (no in-app chat).

## Definition of Done
Three apps boot · shared API client hits `/api/health/` · i18n switch works ·
PWA installable · lint/typecheck pass.

## Checkpoint update
F00 = DONE, note monorepo tool (turbo/nx/pnpm workspaces).
