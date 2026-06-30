# Jaqyn — Task Tracker

Local group rewards & loyalty platform MVP (Bishkek SMBs).
Source of truth: the Technical Build Document (TBD). This folder breaks it into
agent-executable task files plus a single live progress file.

## Layout

```
tasks/
  README.md            ← you are here
  CHECKPOINT.md        ← LIVE progress. Agent updates after EVERY task.
  _local/              ← local-only notes (test accounts, etc.)
  backend/             ← B00..B11 task files (Django + DRF)
  frontend/            ← F00..F04 task files (Next.js: customer/business/staff)
```

> Shared reference docs (schemas, API, conventions, structure, docker) moved out
> of `tasks/_shared/` into the real docs tree — see `docs/INDEX.md`. `tasks/` is
> a tracker system only.

## How an agent uses this

1. Open `CHECKPOINT.md`. Pick the first task whose status is `TODO` and whose
   `Depends on` tasks are all `DONE`.
2. Open that task file (e.g. `backend/B01-auth.md`). Read **Goal**, **Models**,
   **Endpoints**, **Logic**, **Acceptance**, **Definition of Done**.
3. Cross-reference `backend/docs/data-model.md` (canonical models),
   `backend/docs/api.md` / `docs/contracts/API.md`, and
   `docs/conventions/CONVENTIONS.md` for exact field names, payloads, error codes.
4. Implement. Run the task's acceptance checks.
5. Update `CHECKPOINT.md`: flip status to `DONE`, fill the date + notes, tick the
   checkboxes. Commit.
6. Move to the next eligible task.

## Status legend

- `TODO` — not started
- `WIP` — in progress
- `BLOCKED` — waiting on a dependency or decision (note why)
- `DONE` — acceptance criteria pass, DoD met, checkpoint updated

## Current build scope

**Backend core (Sprint 1)** is the active scope: B00–B04 + Django Admin.
B05–B11 and all frontend files are planned/staged for later sprints but fully
specified here so any agent can pick them up.

## Definition of Done (global — from TBD §22)

A task is DONE only when: backend logic implemented · API documented · permissions
tested · (frontend) screen wired to real API · loading + empty + error states ·
logs created · admin can inspect · basic tests pass · works on mobile browser.
