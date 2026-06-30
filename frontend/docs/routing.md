---
title: Frontend Routing
service: frontend
type: reference
status: active
last_reviewed: 2026-06-30---

# Frontend Routing

App Router tree under `frontend/apps/web/app`. One app, three role areas by URL
prefix. Routes below are the real segments found in the tree.

## Customer (root, `/`)

- `/` — root page
- `/login`, `/signup`, `/signup/email`, `/signup/complete`, `/forgot-password`
- `/onboarding` — first-run tour
- `/nearby`, `/nearby/[id]` — discovery (uses Google maps marker clustering)
- `/c/[id]` — business public profile
- `/loyalty`, `/loyalty/[id]` — loyalty wallet
- `/campaigns`, `/campaigns/[id]`, `/campaigns/[id]/group`,
  `/campaigns/[id]/group/invite`, `/campaigns/visit-qr`
- `/campaign-wallet`, `/campaign-wallet/[id]`
- `/rewards`, `/collect`, `/scan`, `/qr`
- `/q/[token]` — public QR resolve / scan entry
- `/profile`

Most customer segments have `loading.tsx` + `error.tsx` alongside `page.tsx`.

## Business (`/business/*`)

- `/business` (+ `layout.tsx`) — segment root
- `/business/login` — **redirects** to `/login?return=/business`
- `/business/register`, `/business/onboarding`, `/business/activate`
- `/business/dashboard`, `/business/reports`, `/business/customers`,
  `/business/staff`, `/business/more`, `/business/profile`, `/business/qr`
- `/business/campaigns`, `/business/campaigns/new`, `/business/campaigns/[id]`
- `/business/loyalty`, `/business/loyalty/new`, `/business/loyalty/[id]`
- `/business/rewards`

`/business/activate` is served with `Referrer-Policy: no-referrer`
(`next.config.js`) so the invite token doesn't leak via `Referer`.

## Staff (`/staff/*`)

- `/staff` (+ `layout.tsx`) — segment root
- `/staff/login` — **redirects** to `/login?return=/staff`
- `/staff/scan` — unified scan (auto-routes by QR type)
- `/staff/activity`, `/staff/groups`, `/staff/profile`

## Role routing & login redirect

Auth is unified at **`/login`** (phone+OTP or email+password). The per-role
login pages are thin server components that `redirect()` into it:

- `app/business/login/page.tsx` → `redirect("/login?return=/business")`
- `app/staff/login/page.tsx` → `redirect("/login?return=/staff")`

After authenticating, the shared `postAuthRoute(authResult, returnTo)` helper
(`@jaqyn/api`, `customer/postAuthRoute.ts`) decides the landing route:

1. customer with `profile_completed === false` → `/signup/complete`
2. new customer / tour not finished → `/onboarding?return=<returnTo>`
3. otherwise by area → business `/business/dashboard`, staff `/staff`,
   customer → the `return` URL (default `/`)
