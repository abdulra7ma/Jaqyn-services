# Launch QA — workflow audit fixes

Scope: pre-launch fix pass from the full workflow audit (2026-07-05).
Launch window: 2–3 days. Only fixes in this folder are in scope — the
post-launch backlog lives in `PLAN.md` and must NOT be started now.

## Layout

```
launch-qa/
  README.md       ← agent protocol (this file)
  PLAN.md         ← audit summary: good / bad / critical + backlog
  CHECKPOINT.md   ← LIVE status. Update after EVERY fix.
  FIX-01..NN.md   ← one file per fix
```

## Agent protocol

1. Open `CHECKPOINT.md`. Pick the first fix with status `TODO` (they are
   priority-ordered; do them in order).
2. Open its `FIX-NN.md`. Read **Current behavior**, **Expected behavior**,
   **Fix**, **Verify**.
3. Spawn/use the model recommended in the fix file (see AGENTS.md
   "Model selection"). Give it ONLY the files listed.
4. Implement. Run the **Verify** steps exactly. A fix is done only when
   every verify step passes against the running app (use `.claude/launch.json`
   config `web` + local backend; see memory: frontend must proxy to
   127.0.0.1:8000).
5. Record in `CHECKPOINT.md`: status → `DONE`, date, one-line note of what
   was observed (actual behavior vs expected). If a verify step fails,
   status → `BLOCKED` with the exact failure — do not continue past it.
6. Confirm with the user (show verify evidence), then move to the next fix.

## Rules

- No scope creep: if you find a new bug, add a line to `PLAN.md` backlog —
  do not fix it inline.
- Each fix = one commit, Conventional Commits style.
- Frontend rules `.claude/rules/frontend.md` + `docs/design-system.md`
  apply to any UI change; add/adjust a test in the same change.

## Cleanup (mandatory, final step)

After ALL fixes are `DONE`, verified, committed, and the user has confirmed
the pass is complete: **delete the entire `tasks/launch-qa/` folder** in a
final `chore:` commit. This folder is a temporary work tracker, not
documentation. Nothing in it may be referenced from docs/.
