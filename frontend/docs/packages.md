---
title: Frontend Packages
service: frontend
type: reference
status: active
last_reviewed: 2026-06-30---

# Frontend Packages

Four workspace packages under `frontend/packages`. Each is `private`, version
`0.0.0`, and (except `config`) entry-points straight at TypeScript source
(`main`/`types` → `./src/index.ts`); the app transpiles them via
`transpilePackages`.

## `@jaqyn/api`

Server-state layer: the fetch client, per-domain API objects, response
adapters, TanStack Query hooks, and types. Public surface from
`src/index.ts`:

- **Client core** — `api`, `request`, `API_URL`, `RequestOptions`,
  `ApiClientError`, `tokenStore`, `AUTH_EVENT`, `ApiProvider`, `useHealth`,
  envelope types (`ApiEnvelope`, `ApiSuccess`, `ApiError`, `HealthData`).
- **Per-domain** (customer, business, staff, loyalty) — each re-exports its
  `*Api` object + interface type, all its `hooks`, and all its `types`.
  e.g. `customerApi` / `CustomerApi`, `businessApi`, `staffApi`, `loyaltyApi`.
- `postAuthRoute` — shared post-login landing decision (role + profile state).

Per-domain layout (`src/<domain>/`):

- `api.ts` — one typed interface (e.g. `CustomerApi`) and **one live
  implementation** wired to the backend through the shared client.
- `adapters.ts` — maps raw backend rows to typed domain objects.
- `hooks.ts` — `useQuery`/`useMutation` wrappers + the query-key factory.
- `types.ts` — domain types.

The client (`client.ts`) reads `NEXT_PUBLIC_API_URL` (default
`http://localhost:8000`), unwraps the `{success, data}` envelope, attaches the
JWT, and auto-refreshes on 401. Tokens live in `tokens.ts` (`tokenStore`).

**Adapters note (task said "live+mock adapters"):** the code has a single live
implementation per domain plus `adapters.ts` *response mappers*. The interface
seam makes a mock implementation possible (and `api.ts` comments call the
wiring "swappable"), but **no mock adapter is checked in.** `adapters.ts` is
not a mock — it is the raw-row → domain mapping. The only test scaffolding is
`customer/adapters.test.ts` and `customer/postAuthRoute.test.ts` (run via the
package's `test` script with `node --test`).

### Query-key factory

Keys are co-located with each domain's hooks, not inlined in components:

- customer: a `qk` object in `customer/hooks.ts` — `me`, `myQr`,
  `nearby(params)`, `categories`, `business(id)`, `qr(token)`,
  `campaigns(params)`, `campaignFeed(filter)`, `campaign(id)`,
  `campaignWallet`, `campaignVoucher(id)`, `campaignCatalog(id)`,
  `groupSession(id)`, `myGroups`.
- loyalty: `loyaltyKeys` (`["loyalty", ...]` prefixed).
- business: a keys object (`["business", ...]` prefixed).

Mutations invalidate by key/prefix (e.g. `["campaigns"]`, `["campaign-feed"]`).

## `@jaqyn/config`

Shared build config. `main` → `index.js`, which exports:

- `tailwindPreset` (`tailwind-preset.js`) — the design tokens (colors, radii,
  shadows, fonts, gradients) that back `docs/design-system.md`. The app's
  Tailwind config consumes this preset.
- `postcss` (`postcss.js`).

`files`: `tailwind-preset.js`, `postcss.js`, `index.js`. Extend the preset
here — never inline raw hex/px in app code.

## `@jaqyn/i18n`

EN + RU copy and the i18n runtime. Public surface from `src/index.ts`:

- `LOCALES`, `DEFAULT_LOCALE`, `messages`, type `Locale` (from `locales.ts`).
- `I18nProvider`, `useI18n`, `useT` (from `provider.tsx`).
- `LanguageSwitch` component.

All user-facing copy goes through this package (also a dependency of
`@jaqyn/api`).

## `@jaqyn/ui`

Shared visual primitives. Public surface from `src/index.ts`:
`cn`, `Button` (+`ButtonProps`), `Input` (+`InputProps`), `Card`, `Badge`,
`ProgressBar`, `Loading` / `Empty` / `ErrorState` (from `states`), `Sheet`
(+`SheetProps`), `Dialog` (+`DialogProps`), `AlertDialog` (+`AlertDialogProps`).

Depends on `@radix-ui/react-dialog` and `vaul` (the responsive sheet system).
Import these — do not re-implement per screen.
