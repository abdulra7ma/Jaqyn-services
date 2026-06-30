---
title: Frontend State
service: frontend
type: reference
status: active
last_reviewed: 2026-06-30---

# Frontend State

Two kinds of state, kept separate.

## Server / remote state — TanStack Query

All fetched data lives in React Query, accessed through `@jaqyn/api` hooks —
not mirrored into `useState` or context.

- **One `QueryClient`**, created in `@jaqyn/api` `src/provider.tsx`
  (`ApiProvider`), with explicit defaults: `retry: 1`, `staleTime: 30_000`,
  `refetchOnWindowFocus: false`. The client is held in `useState(() => …)` so it
  survives re-renders. `ApiProvider` is mounted in `app/providers.tsx`.
  > **TODO:** `gcTime` is not set explicitly (the rule asks for it); library
  > default applies.
- **Query keys come from a typed factory** co-located with each domain's hooks
  (not inlined in components): `qk` in `customer/hooks.ts`, `loyaltyKeys` in
  `loyalty/hooks.ts`, the keys object in `business/hooks.ts`. See
  [packages.md](./packages.md) for the full list.
- **Mutations invalidate** the relevant keys. Single-record keys are
  invalidated directly (e.g. `qk.campaignWallet`, `qk.myGroups`); list/feed
  families are invalidated by prefix (e.g. `["campaigns"]`, `["campaign-feed"]`)
  so every filtered variant refreshes at once. No refetch-everything hacks.

## UI / ephemeral state

Open/closed, form input, selection, etc. → local `useState`/`useReducer`,
co-located with the component (e.g. the landing-style local form state pattern,
menu toggles). Not pushed into React Query or context.

## Context

Two low-frequency providers wrap the tree (`app/providers.tsx`):

- `ApiProvider` — TanStack Query client (above).
- `I18nProvider` (`@jaqyn/i18n`) — locale + copy, via `useT` / `useI18n`.

Context is reserved for these cross-cutting, low-frequency values — server data
is not put in context.

## Auth tokens

JWTs are held in `tokenStore` (`@jaqyn/api` `tokens.ts`), set by the auth
mutations and read by the fetch client; an `AUTH_EVENT` signals auth changes.
The client auto-refreshes the access token on 401.
> **TODO:** confirm token storage backend (e.g. `localStorage` vs cookie) —
> `frontend.md` prefers httpOnly cookies; `tokens.ts` not read here.
