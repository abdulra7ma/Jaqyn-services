# Launch QA — CHECKPOINT (live)

Protocol: see README.md. Work top-to-bottom. Flip status only after the
fix's Verify steps pass against the running app. On failure: BLOCKED + exact
error, stop. After ALL DONE + user confirmation → delete tasks/launch-qa/.

Status legend: TODO · WIP · BLOCKED · DONE

| # | Fix | Priority | Model | Status | Date | Verified behavior (observed vs expected) |
|---|---|---|---|---|---|---|
| 01 | Starter mission 404 (`/visit-qr`) | CRITICAL | haiku | DONE | 2026-07-05 | href fixed + regression test; campaigns suite 57/57 pass (commit bbd65a5) |
| 02 | Staff desktop redirect loop | CRITICAL | sonnet | DONE | 2026-07-05 | redirect removed, scan renders on desktop (centered col + nav pill); tsc clean, staff tests 9/9 (commit d52e952) |
| 03 | Ended-campaign dead end | CRITICAL | sonnet | DONE | 2026-07-05 | ended/cancelled banner + /campaigns + conditional /rewards link, EN+RU keys; 68/68 campaigns tests (commit d32fddd) |
| 04 | Dashboard activity placeholder | CRITICAL | opus | DONE | 2026-07-05 | wired real feed (backend + FE, tests green); i18n TODOs handed to FIX-07 (commit 52d4e51) |
| 05 | Staff code visibility | HIGH | sonnet | DONE | 2026-07-05 | GET /api/business/approval-code/ + useStaffCode, confirm-before-regen; pytest 9/9, tsc clean; 3 i18n keys handed to FIX-07 (commit 6989a5f) |
| 06 | Activity filter chips | HIGH | haiku | DONE | 2026-07-05 | points+social chips wired to kind param, EN+RU labels; tsc + staff tests pass (commit 4776dd5) |
| 07 | i18n hardcoded strings sweep | HIGH | haiku+sonnet | DONE | 2026-07-05 | customer+staff surfaces keyed EN+RU incl. FIX-04/05 carry-overs; 226/226 tests; guest.floating.* RU flagged for copywriter; business-surface strings → backlog (commit d49a706) |
| 08 | Camera-denied guidance | HIGH | sonnet | DONE | 2026-07-05 | reason-specific copy (permission/HTTPS, EN+RU) + manual entry auto-opens; 14/14 staff tests (commit 09a738d) |
| 09 | Pitch support link → env | MEDIUM | haiku | DONE | 2026-07-05 | NEXT_PUBLIC_SUPPORT_URL via app/_lib/config.ts, default t.me/jaqyn; tsc pass (commit 876f4d1) |
| 10 | Dead code cleanup | MEDIUM | sonnet | DONE | 2026-07-05 | shadowed StaffScanView + dead hooks + orphan i18n keys removed; agent's out-of-scope catalog refactor reverted; suites green (commit 06cf7c1) |

## Launch gate
- [x] 01–04 DONE (blockers)
- [x] 05–08 DONE or explicitly deferred by user
- [ ] Full money-journey pass (LAUNCH.md §4) re-run after fixes
- [ ] User confirmed → folder deleted (final `chore:` commit)

## Notes log
(append one line per session: date · fixes touched · anything discovered →
new findings go to PLAN.md backlog, not new fixes here)
- 2026-07-05 · FIX-01..10 all DONE, one commit each (bbd65a5, d52e952,
  d32fddd, 52d4e51, 6989a5f, 4776dd5, d49a706, 09a738d, 876f4d1, 06cf7c1).
  FIX-10 agent died mid-run w/ an out-of-scope catalog-suggestion refactor
  mixed in — reverted; in-scope cleanup kept and re-verified by hand.
  Final suites: backend staff+campaigns+businesses+qr green, web 226/226,
  tsc clean. Remaining gate items: live money-journey pass + user confirm.
