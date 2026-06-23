# Jaqyn — Project Rules

Loyalty/rewards platform. Monorepo: Django backend + pnpm/turbo Next.js frontend.

Detailed code rules (always apply when touching that code):
- Backend: @.claude/rules/backend.md
- Frontend: @.claude/rules/frontend.md

## Architecture
- `backend/` — Django 5 + DRF + SimpleJWT + Celery + Redis + Postgres.
- `frontend/` — pnpm + turbo monorepo. Apps in `apps/`, shared packages in `packages/`.
- `landing/` — marketing site.
- Prod: Railway (backend/Celery/PG/Redis) + Vercel (frontend) + R2 media. See `DEPLOY.md`.

## Universal rules
- **No secrets in code or commits.** Config via env vars only.
- **No `console.log` / `print` / commented-out code** in committed changes.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`).
- Branch off `main`; every change via PR with review.
- CI gate: lint + type-check + tests must pass before merge.
- Match surrounding code style. No drive-by reformatting of untouched lines.
- Prefer editing existing files over creating new ones. No new top-level dirs without reason.
- When changing behavior, add/adjust a test in the same change.

## Workflow
- Before a feature: confirm scope, don't assume.
- Make the change observable end-to-end (API + UI) before claiming done.
- State test results plainly. If something is skipped or failing, say so.
