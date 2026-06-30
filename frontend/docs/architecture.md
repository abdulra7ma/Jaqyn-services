---
title: Frontend Architecture
service: frontend
type: reference
status: active
last_reviewed: 2026-06-30---

# Frontend Architecture

Baseline of record: `.claude/rules/frontend.md`. This doc records what the code
actually does and flags where it diverges from the rules.

## Server vs client components

The rule is "Server Components by default; `'use client'` pushed as low as
possible." In practice `apps/web` is a **client-heavy SPA-style app**: data is
fetched on the client through TanStack Query hooks (`@jaqyn/api`), and the API
client reads JWTs from a client-side `tokenStore`. The interactive page bodies
are client components.

- The **root layout** (`app/layout.tsx`) is a server component: it sets
  `metadata`/`viewport`, loads fonts via `next/font/google`
  (Bricolage Grotesque → `--font-display`, Hanken Grotesk → `--font-sans`),
  `lang="ru"`, and renders `<Providers>`.
- **`app/providers.tsx`** is `'use client'` and wraps the tree in `ApiProvider`
  (TanStack Query) then `I18nProvider`. It also unregisters any stale service
  worker on mount.
- Per-role layouts: `app/business/layout.tsx`, `app/staff/layout.tsx`.

**Divergence from the rule:** the app does not server-fetch + hydrate; it
fetches client-side. Treat the "server-fetch / prefetch + hydration boundary"
guidance in `frontend.md` as the target, not the current state. **TODO:**
confirm whether any route does server-side data fetching.

## Login / role redirect

Auth is unified at `/login`. `app/business/login/page.tsx` and
`app/staff/login/page.tsx` are server components that `redirect()` to
`/login?return=/business` and `/login?return=/staff`. After auth, the shared
`postAuthRoute()` helper (`@jaqyn/api`, `customer/postAuthRoute.ts`) picks the
landing route by role and profile state (see [routing.md](./routing.md)).

## Data-fetching approach

- One fetch client (`@jaqyn/api` `client.ts`): serializes JSON, attaches the
  JWT, unwraps the backend `{success, data}` envelope, and transparently
  refreshes the access token on 401 via `/api/auth/token/refresh/`.
- Each domain (customer / business / staff / loyalty) has an `api.ts` (one live
  implementation behind a typed interface), `adapters.ts` (raw backend rows →
  typed domain objects), `types.ts`, and `hooks.ts` (TanStack Query wrappers).
- Lists arrive paginated as `{results: [...]}`; adapters map each row.

See [state.md](./state.md) for the query-key + invalidation model.

## API origin / proxy

`apps/web/next.config.js` rewrites `/api/:path*` → `${API_PROXY_TARGET}/api/:path*/`
(trailing slash forced for Django) and `/media/:path*` → backend media. When
`NEXT_PUBLIC_API_URL` is empty/relative, all API traffic stays same-origin and
Next proxies it to the backend — avoids CORS / mixed-content behind one HTTPS
host. `output: "standalone"`; `transpilePackages` lists the three TS packages.

`/business/activate` sets `Referrer-Policy: no-referrer` (keeps the invite token
in the URL from leaking via `Referer`).

## How packages compose

```
app (apps/web)
 ├─ @jaqyn/api    server state: client, per-domain api/adapters/hooks/types, ApiProvider
 ├─ @jaqyn/i18n   I18nProvider, useT, LanguageSwitch  (also a dep of @jaqyn/api)
 ├─ @jaqyn/ui     shared primitives (depends on radix-dialog + vaul)
 └─ @jaqyn/config Tailwind preset + PostCSS (build-time)
```

Cross-package imports use the package name (`@jaqyn/...`), never relative paths
across roots. `@jaqyn/api` depends on `@jaqyn/i18n`.
