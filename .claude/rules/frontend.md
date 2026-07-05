# Frontend Rules — Next.js / React / TanStack Query

Applies to `apps/web` and `packages/*`. pnpm workspaces + Turbo. Next.js 14 (App
Router) + React 18 + TypeScript 5 (`strict: true`) + TanStack Query 5 + Tailwind 3.

## Design system (read before any UI work)
- **`@docs/design-system.md` is the source of truth for color, type, shape,
  elevation and every UI primitive.** Read it before building or editing any
  screen, component, or visual. Do not invent colors, radii, shadows, or type
  scales — pull them from there.
- Tokens map to the Tailwind preset in `@jaqyn/config`
  (`frontend/packages/config/tailwind-preset.js`). Use the class, not the hex
  (see the mapping table in the design-system doc). If a value isn't in the
  preset, extend the preset — never inline a raw hex/px.
- The design-system doc and `tailwind-preset.js` are kept in sync; change both in
  the same PR.

## Tooling
- Package manager: **pnpm** with workspaces. Internal deps use the `workspace:`
  protocol — never a version range, never a relative path across packages.
- Build/tasks: **Turbo**. Every task (`build`, `lint`, `typecheck`, `test`) declares its
  `dependsOn` and `outputs` so caching is correct. A task with no declared outputs
  silently breaks the cache — that's a bug.
- Lint: **ESLint** + `eslint-config-next`. Shared config lives in `@jaqyn/config`; apps
  and packages extend it, never fork their own rules.
- Format: **Prettier** + `prettier-plugin-tailwindcss` (canonical class order). Formatting
  is not ESLint's job and not a matter of taste — it's automated.
- Hooks: **husky + lint-staged** run eslint + prettier + `tsc` on staged files.
- Types: `tsc --noEmit` runs in CI and **gates merge**. Next's build is not the type
  check — a green `next build` does not mean the types are sound.
- Tests: **Vitest + React Testing Library** for units/components; **Playwright** for
  critical end-to-end flows; **MSW** to mock the API at the network boundary.

## TypeScript
- `strict: true` stays on. Don't relax it per-file with `// @ts-nocheck`.
- **No `any`.** Use `unknown` + narrowing. No non-null `!` without a comment justifying
  why it can't be null. `as` casts only at a validated boundary, never to silence the
  compiler.
- **Validate external data at runtime, then trust types inward.** API responses, route
  params, search params, env, and form input are `unknown` until parsed (zod) at the
  edge. Past that edge, the type is real and not re-checked.
- Component props are explicitly typed. No implicit `any` props, no `object`/`{}` props.

## App Router — Server vs Client
- **Server Components by default.** Add `'use client'` only when the component needs
  interactivity, hooks, or browser APIs — and push that boundary as low in the tree as
  possible. A page is not a client component because one button is.
- **Fetch on the server** where the data is server-renderable. Reach for client-side
  fetching only for data that genuinely depends on client state or user interaction.
- `next/link`, `next/image`, `next/font` are mandatory over raw `<a>` / `<img>` / web
  fonts. No exceptions without a comment.
- **Metadata API** for `<head>` — no manual head tags.
- Every meaningful route segment has `loading.tsx` and `error.tsx`. Errors are not
  swallowed; they surface to a boundary.
- Route segment config (`dynamic`, `revalidate`, `runtime`) is **explicit** where the
  default isn't obviously right.

## Server Actions & data mutations
- A Server Action is a **public endpoint**. Validate its input with zod and authorize it
  exactly as you would an API route — never trust the caller.
- Mutations from the client go through TanStack Query mutations, not bare `fetch` in a
  handler.

## Server state — TanStack Query
- **Server/remote state lives in React Query. Full stop.** Don't mirror fetched data into
  `useState`, Context, or a global store — that's two sources of truth that will drift.
- One `QueryClient` with explicit defaults (`staleTime`, `gcTime`, `retry`). Don't accept
  the library defaults silently.
- **Query keys come from a typed key factory**, not inline string arrays scattered across
  components. Co-locate the factory with the resource (likely in `@jaqyn/api`).
- Mutations **invalidate or update** the relevant keys. No manual refetch-everything hacks.
- Server-rendered queries use prefetch + a hydration boundary; don't refetch on mount what
  the server already sent.

## Client / UI state
- **Distinguish server state from UI state.** Server state → React Query. Ephemeral UI
  state (open/closed, input, selection) → `useState`/`useReducer`, co-located.
- Context is for low-frequency global values (theme, locale, auth/session) only — never
  high-frequency state that re-renders the tree. Never a dumping ground for server data.

## Styling — Tailwind
- Utilities first. No ad-hoc `.css` files unless a utility genuinely can't express it.
- Conditional classes via `clsx`/`cn` + `tailwind-merge`; never string-concatenate class
  names by hand.
- **Design tokens come from the Tailwind theme config**, not inline magic hex/px values.
  Shared theme lives in `@jaqyn/config`; apps extend, don't redefine.
- Shared visual primitives live in **`@jaqyn/ui`** and are imported — not re-implemented
  per app. A second copy of the same button is a review block.

## i18n
- **All user-facing copy goes through `@jaqyn/i18n`.** No hardcoded strings in components.
- Keys are namespaced and stable; don't key off the English text.
- Formatting (dates, numbers, plurals) goes through the i18n layer, not manual string ops.

## Monorepo & workspace packages
- Cross-package imports use the package name (`@jaqyn/ui`), never a relative path that
  reaches across package roots (`../../packages/...`).
- Each package exposes a **deliberate public surface** via its `exports`/entry file. No
  deep-importing another package's internals.
- `@jaqyn/config` owns shared ESLint / TS / Tailwind / Prettier config. One source of
  truth; packages extend it.

## Components
- Small and focused. One responsibility; co-locate the parts that change together.
- Server/client boundary is explicit and intentional (see App Router section).
- **Accessibility is not optional:** semantic HTML, labelled controls, keyboard
  operability, visible focus, correct roles. Interactive divs are a defect.
- **Empty states are never dead ends.** Every empty screen names the obvious
  next action — create the first item, discover content, show the QR — via
  `Empty`'s `actionLabel`/`onAction` (or `QueryBoundary`'s `emptyAction`).
  A bare "nothing here yet" message is a review block when an action exists.

## QR features (`html5-qrcode`, `react-qr-code`)
- The scanner touches the **camera and the DOM** — it is client-only. `'use client'` +
  dynamic import with `ssr: false`. It must never run during SSR.
- **Clean up on unmount**: stop the scanner and release the camera stream in the effect's
  cleanup. A leaked stream keeps the camera light on and locks the device.
- Handle the unhappy paths explicitly: permission denied, no camera present, insecure
  context (camera needs HTTPS). Don't assume the happy path.
- A scanned payload is **untrusted input.** Parse and validate it (zod) before acting on
  it — never navigate to or fetch a scanned value raw.

## Performance
- Dynamic-import heavy or client-only libraries (the QR scanner, charts) so they stay out
  of the initial bundle.
- `next/image` everywhere, with dimensions, to avoid layout shift.
- Keep server-only code out of the client bundle. Watch bundle size in CI; a sudden jump
  is a review item.
- Memoize where profiling says it pays, not by reflex.

## Config & security
- **Only `NEXT_PUBLIC_` env vars reach the client.** Everything else is server-only.
  Putting a secret behind `NEXT_PUBLIC_` is a leak.
- **Validate env at boot** with a zod schema (public and server schemas separate). A
  missing/invalid var fails the build, not the first request.
- Avoid `dangerouslySetInnerHTML`; if unavoidable, the input is sanitized and the reason
  is commented.
- Mind token storage (SimpleJWT): prefer httpOnly cookies over `localStorage` to limit XSS
  blast radius; if storage is unavoidable, it's a deliberate, commented decision.

## Observability
- Server-side logs are **structured (JSON)**. The backend's request/correlation id is
  read from the response/headers and included in client error reports, so one user action
  is traceable across the frontend → backend seam.
- Errors are reported to the boundary and the logger — never swallowed in a `catch {}`.
- Never log tokens or PII.

## Tests
- Components: test **behavior, not implementation** (RTL — query by role/text, not by
  test-id-as-crutch). Mock the API with MSW, not by stubbing internals.
- Critical flows (auth, QR scan, primary user journeys) have a **Playwright** e2e test.
- Add/adjust a test in the same change that changes behavior.
- State results plainly. If skipped or failing, say so.

## CI gates
- `typecheck` (`tsc --noEmit`), `lint`, `test`, and `build` all gate merge, run through
  Turbo with caching. None is optional.

## Style
- Prettier is the formatter; don't hand-format. No commented-out code in commits.
- Match surrounding style. No drive-by reformatting.