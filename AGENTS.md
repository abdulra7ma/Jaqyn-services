# AGENTS.md — Jaqyn

Guide for any coding agent (Claude Code, Codex, Cursor, …) working in this repo.
Claude Code users: `CLAUDE.md` loads these same rules automatically.

Jaqyn is a loyalty/rewards platform. Monorepo: Django backend + pnpm/turbo
Next.js frontend.

## Rule docs — read the one matching the code you touch

| Area | Doc | Read when |
|---|---|---|
| Backend | `.claude/rules/backend.md` | touching `backend/` (Django/DRF/Celery) |
| Frontend | `.claude/rules/frontend.md` | touching `frontend/apps/*` or `frontend/packages/*` |
| **Design system** | `docs/design-system.md` | **building or editing any UI — read first** |

These are binding, not advisory. Follow them exactly.

## Architecture
- `backend/` — Django 5 + DRF + SimpleJWT + Celery + Redis + Postgres.
- `frontend/` — pnpm + turbo monorepo. Apps in `apps/`, shared packages in
  `packages/` (`@jaqyn/ui`, `@jaqyn/config`, `@jaqyn/api`, `@jaqyn/i18n`).
- `landing/` — marketing site.
- Prod: **Railway runs every service** — backend, Celery, Postgres, Redis,
  frontend, and landing — plus R2 media. No Vercel. See `DEPLOY.md`.

## Documentation — where things live
- **Read `docs/INDEX.md` first** — generated map of every doc, grouped by service.
- `docs/` holds ONLY cross-cutting content: `conventions/`, `schemas/`,
  `contracts/`, `guides/`, `architecture/`, `qa/`, `specs/` (active plans),
  `design-system.md`, and `_archive/` (shipped plans, `status: deprecated`).
- **Per-service docs are canonical** for each deployable: `backend/docs/`,
  `frontend/docs/`, `landing/docs/` (each has `README` + `overview` +
  `architecture`, plus service-specific files).
- `tasks/` is **trackers only** (`B*`/`F*`/`CHECKPOINT.md`), not documentation.
- Every doc carries YAML frontmatter (`title`, `service`, `type`, `status`,
  `last_reviewed`); `docs/INDEX.md` is generated from it — don't hand-edit it.

## UI work — non-negotiable
- **`docs/design-system.md` is the source of truth** for color, type, shape,
  elevation, and every primitive. Read it before any screen/component/visual.
- Use the Tailwind tokens in `@jaqyn/config`
  (`frontend/packages/config/tailwind-preset.js`) — the class, not the hex. If a
  value isn't in the preset, extend the preset; never inline a raw hex/px.
- Shared visual primitives live in `@jaqyn/ui` — import, don't re-implement.
- All user-facing copy goes through `@jaqyn/i18n` — no hardcoded strings.

## Universal rules
- **No secrets in code or commits.** Config via env vars only.
- **No `console.log` / `print` / commented-out code** in committed changes.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`).
- Branch off `main`; every change via PR with review.
- CI gate: lint + type-check + tests must pass before merge.
- Match surrounding code style. No drive-by reformatting of untouched lines.
- Prefer editing existing files over creating new ones. No new top-level dirs
  without reason.
- When changing behavior, add/adjust a test in the same change.

## Workflow
- Before a feature: confirm scope, don't assume.
- Make the change observable end-to-end (API + UI) before claiming done.
- State test results plainly. If something is skipped or failing, say so.

## Commands
- Common tasks live in the `Makefile` (run `make` to list).
- Frontend: `pnpm` + `turbo` (`build`, `lint`, `typecheck`, `test`) from `frontend/`.
- Backend: `pytest` (+ `pytest-django`), `ruff`, `mypy` from `backend/`.
