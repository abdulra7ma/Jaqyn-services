---
title: Landing Overview
service: landing
type: overview
status: active
last_reviewed: 2026-06-30---

# Landing Overview

`landing/` is the standalone marketing site — a Vite + React + TypeScript SPA,
separate from the `frontend/` app. It pitches Jaqyn to businesses/customers and
captures leads via a form that posts to the backend.

## Stack

- **Vite 5** + `@vitejs/plugin-react` (`vite.config.ts` — plain React plugin,
  no extra config).
- **React 18** + **TypeScript 5** (`build` = `tsc -b && vite build`).
- No router, no state library — a single-page composition.

## Structure (`landing/src`)

- `main.tsx` — entry; mounts `App`.
- `App.tsx` — composes the page: `I18nProvider` wrapping `Header`, `Hero`,
  `HowItWorks`, `CustomerBenefits`, `BusinessBenefits`, `DealsCarousel`,
  `QrLoyalty`, `ExampleCampaign`, `DashboardPreview`, `Trust`, `Faq`,
  `LeadForm`, `FinalCta`, `Footer`, `MobileCta`. Holds the lead-form state and
  client-side validation; submits via `submitLead` from `api.ts`.
- `components/` — the section components above + `LanguageSwitcher`.
- `i18n/` — `I18nContext.tsx` (provider/hook), `content.ts`, `translations.ts`
  (EN/RU copy).
- `theme.ts` — JS style helpers + accent constants (`ACCENT`/`ACCENT_DEEP`,
  avatar/icon-tile builders) ported from the design prototype.
- `styles.css` — global styles.
- `api.ts` — `submitLead`; lead submission to the backend.
- `config.ts` — `appUrl()` helper + `APP_ROUTES` (deep links into the live
  `frontend/` app: `/nearby`, `/login`, `/business/login`); base from
  `VITE_APP_URL` (default `http://localhost:3000`).
- `hooks/` — `useLandingEffects` (scroll/interaction effects).
- `vite-env.d.ts` — Vite env typings.

## Env

- `VITE_APP_URL` — base URL of the live app the CTAs link into (mirrors backend
  `FRONTEND_URL`).
- API base for `submitLead`: see `api.ts` (`VITE_*`). **TODO:** confirm the
  exact env var name in `api.ts`.
