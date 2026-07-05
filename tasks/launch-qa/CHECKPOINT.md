# Launch QA — CHECKPOINT (live)

Protocol: see README.md. Work top-to-bottom. Flip status only after the
fix's Verify steps pass against the running app. On failure: BLOCKED + exact
error, stop. After ALL DONE + user confirmation → delete tasks/launch-qa/.

Status legend: TODO · WIP · BLOCKED · DONE

| # | Fix | Priority | Model | Status | Date | Verified behavior (observed vs expected) |
|---|---|---|---|---|---|---|
| 01 | Starter mission 404 (`/visit-qr`) | CRITICAL | haiku | TODO | — | — |
| 02 | Staff desktop redirect loop | CRITICAL | sonnet | TODO | — | — |
| 03 | Ended-campaign dead end | CRITICAL | sonnet | TODO | — | — |
| 04 | Dashboard activity placeholder | CRITICAL | opus | TODO | — | — |
| 05 | Staff code visibility | HIGH | sonnet | TODO | — | — |
| 06 | Activity filter chips | HIGH | haiku | TODO | — | — |
| 07 | i18n hardcoded strings sweep | HIGH | haiku+sonnet | TODO | — | — |
| 08 | Camera-denied guidance | HIGH | sonnet | TODO | — | — |
| 09 | Pitch support link → env | MEDIUM | haiku | TODO | — | — |
| 10 | Dead code cleanup | MEDIUM | sonnet | TODO | — | — |

## Launch gate
- [ ] 01–04 DONE (blockers)
- [ ] 05–08 DONE or explicitly deferred by user
- [ ] Full money-journey pass (LAUNCH.md §4) re-run after fixes
- [ ] User confirmed → folder deleted (final `chore:` commit)

## Notes log
(append one line per session: date · fixes touched · anything discovered →
new findings go to PLAN.md backlog, not new fixes here)
