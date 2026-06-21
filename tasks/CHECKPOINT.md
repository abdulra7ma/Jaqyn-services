# CHECKPOINT — Live Progress

Single source of truth for what's done. **Update after EVERY task**: flip status,
fill Date + Notes, tick the DoD boxes in the task file. Statuses: TODO · WIP ·
BLOCKED · DONE.

Pick the first `TODO` whose deps are all `DONE`. Active scope = **Backend core
(Sprint 1): B00→B04 + F04 (Django Admin)**.

---

## Backend

| ID  | Task                              | Phase | Sprint | Depends     | Status | Date | Notes |
|-----|-----------------------------------|:-----:|:------:|-------------|:------:|------|-------|
| B00 | Project setup & infra             | 0     | 1      | —           | DONE   | 2026-06-17 | Django/DRF scaffold, Docker stack, envelope, health check; local check + health test pass. |
| B01 | Auth, roles, customer profile     | 1     | 1      | B00         | DONE   | 2026-06-17 | OTP provider is a Celery dev-log stub; limits are 5/hour per phone, 20/hour per IP, 5 verify attempts. |
| B02 | Business register & approval      | 1     | 1      | B01         | DONE   | 2026-06-17 | Approval flow lives in Django Admin actions and REST admin endpoints under /api/admin/businesses/. |
| B03 | QR tokens, staff, approval codes  | 2     | 1      | B02         | DONE   | 2026-06-17 | Token length is 32+ urlsafe chars; approval codes are 6 digits; Celery beat rotates daily and manual regeneration is live. |
| B04 | Loyalty program + collect loop    | 2     | 1      | B03         | DONE   | 2026-06-17 | Sprint 1 backend loop passes locally: approved merchant creates reward/QR, customer validates code, collects, unlocks, sees progress; 20 tests pass. |
| B05 | Reward unlock & redemption        | 3     | 2      | B04         | DONE   | 2026-06-17 | Redemption codes are 8-char uppercase urlsafe strings; expiry uses reward expiry_days, with pending rewards expired by Celery beat. |
| B06 | Group offers                      | 4     | 3      | B02         | DONE   | 2026-06-17 | Guards enforce draft/rejected→pending, pending→active/rejected, active↔paused; public list only active in date window. |
| B07 | Group deals, check-in, redeem     | 4     | 3      | B06, B03    | DONE   | 2026-06-17 | Sprint 3 lifecycle passes locally: create/join/full/check-in/complete/staff redeem once, with wrong-business and window guards. |
| B08 | Staff endpoints consolidation     | 2-4   | 2-3    | B03,B05,B07 | DONE   | 2026-06-17 | Staff JWT maps to StaffMember via user.staff_memberships; every scan/recent/group query scopes through that business. |
| B09 | Reporting & analytics             | 5     | 4      | B04,B05,B07 | DONE   | 2026-06-17 | Estimated revenue is 0.00 until POS/manual spend fields exist; returning customer = scans on at least 2 distinct days. |
| B10 | Notifications & jobs              | 6     | 5      | B01,B04,B07 | DONE   | 2026-06-17 | SMS provider is dev-log Notifier with NotificationLog; beat rotates approval codes daily and expires rewards/groups hourly. |
| B11 | Fraud, admin tools, hardening     | 7     | 6      | all         | DONE   | 2026-06-17 | Backup cron script kept at backend/ops/backup/backup.sh; restore runbook dry-run documented, full backend suite passes. |

## Frontend

| ID  | Task                  | Phase | Depends            | Status | Date | Notes |
|-----|-----------------------|:-----:|--------------------|:------:|------|-------|
| F00 | Frontend setup        | 0     | B00                | DONE   | 2026-06-17 | pnpm workspaces + Turborepo; ONE Next app (apps/web) + ONE container, 3 routed areas: / customer, /business, /staff (each own scoped PWA manifest); shared api/ui/i18n/config; health wired, RU/EN switch, SW. build/lint/typecheck pass. |
| F01 | Customer PWA          | 1-4   | F00, B01–B07       | DONE   | 2026-06-17 | All 19 screens built (home/login-OTP/QR collect/rewards+detail+redemption code/group offers+create/group page join+checkin+share/nearby/profile); API isolated in packages/api customer layer (interface + live + mock, default LIVE via NEXT_PUBLIC_USE_MOCKS). Live-verified vs localhost:8000 (me, rewards, offers, group create/fetch, profile). Gaps: no public business endpoint (nearby/profile on seed); business/member names absent in payloads. |
| F02 | Business dashboard    | 1-5   | F00, B02–B09       | DONE   | 2026-06-17 | Owner pages (OTP login, register, dashboard metrics, rewards CRUD+pause/activate, group offers create+submit/pause/activate, merchant QR download, customers masked, reports, settings, staff approval-code regen) under /business; live API layer packages/api/business. Owner auth = phone OTP. e2e 19/19 pass. |
| F03 | Staff PWA             | 2-4   | F00,B03,B05,B07,B08| DONE   | 2026-06-17 | Staff pages (business_code+PIN login, home+today-code, camera scan via html5-qrcode + manual fallback, redeem once, groups verify/redeem, recent activity) under /staff; live API layer packages/api/staff. QR lib html5-qrcode (works Safari/Chrome). e2e redeem/no-double-redeem + group verify pass. **Design pass 2026-06-17: rebuilt all staff screens to Jaqyn.dc.html canvas — gradient shop tile + STAFF badge header, segmented Code/Redeem/Groups/Activity tab strip (replaced bottom nav), big approval-code card, redeem empty/pending states, group-arriving card w/ member check-in rows, grouped activity list, on-brand PIN login. jqIn keyframe + 27 i18n keys (RU+EN). typecheck+lint clean; login/Code/Redeem verified in browser.** |
| F04 | Admin panel (Django)  | 1-7   | B02+               | TODO   |      |       |

---

## Sprint gates (must pass before sprint is "done")

**Sprint 1** (B00–B04, F04 admin): a real customer scans merchant QR → logs in by
phone → enters staff code → gets 1 stamp → sees progress. A merchant registers →
gets admin-approved → creates reward → downloads QR → sees scan count.

**Sprint 2** (B05, B08, F03): customer collects enough stamps → unlocks → shows
reward QR/code; staff scans/enters code → redeems once (no double redeem).

**Sprint 3** (B06, B07): a group is created → joined by friends → reaches size →
checks in → unlocks group reward → redeemed once.

---

## Log  (append newest first: `YYYY-MM-DD · ID · what changed`)
- 2026-06-17 · AUTH · Unified login across roles. Backend: every user logs in via phone+OTP or new `POST /api/auth/login-password/` (email+password); verify-otp/me return `area` (owner>staff>customer); me adds a `staff` block; removed staff business_code+PIN login (StaffLoginView/serializer/staff_login) — staff now backed by a phone/email user (role=staff) linked to StaffMember via `link_staff_user`/`staff_token`; migrated 4 test files + seed off PIN; dev-OTP isolated via conftest autouse. Frontend: one unified `/login` (phone↔email tabs) routing by area; `/staff/login` + `/business/login` now redirect to it; `useStaffAuth` derives identity from `/me`; added `usePasswordLogin`; removed staff PIN api/hook/session. 49 backend tests pass; web typecheck+lint clean. Verified live: staff phone→/staff, owner email/pw→/business, bad pw→401.
- 2026-06-17 · DEV · Static env-gated test accounts: `seed_test_users` command (clients+owner+staff) auto-run on startup when `SEED_TEST_USERS=true`; `DEV_LOGIN_OTP` static-OTP bypass; all accounts get email+password (`SEED_TEST_PASSWORD`). Creds in tasks/_local/test-accounts.md (gitignored).
- 2026-06-17 · B00 · Created backend scaffold with settings split, Docker/Compose, Celery stubs, response envelope, health endpoint, custom user foundation, migrations, and local health test.
- 2026-06-17 · B01 · Implemented phone OTP auth, JWT issuing/logout, roles, customer profile/me endpoints, admin registration, and auth acceptance tests.
- 2026-06-17 · B02 · Added business registration, owner-scoped business profile/dashboard, admin pending/approve/reject/disable endpoints, shared approval service, and tests.
- 2026-06-17 · F00 · Scaffolded Next.js monorepo (pnpm workspaces + Turborepo): customer/business/staff PWAs + shared api/ui/i18n/config packages, JWT-refresh API client unwrapping the envelope, /api/health/ wiring, RU/EN i18n switch, manifest+service-worker PWA, one ARG-APP Dockerfile + 3 dev compose services. build/lint/typecheck pass.
- 2026-06-17 · B03 · Added merchant QR generation/resolve, staff PIN login, daily approval codes, code validation, scan logging, business codes, migrations, and QR/staff tests.
- 2026-06-17 · B04 · Added reward program CRUD, customer reward progress APIs, QR collect loop, fraud limits, ledger transactions, redemption unlock creation, and full backend test coverage.
- 2026-06-17 · B05 · Added customer redemption-code generation, staff redeem by manual code or QR token, expiry handling, redeem-once guards, logs, and redemption tests.
- 2026-06-17 · F01 · Built all customer screens (QR collect loop, rewards + redemption code, group offers/create/join/check-in/share, nearby, profile, OTP login) against an isolated API layer in packages/api/customer (CustomerApi interface + live + mock impls, adapters, session). Default wired LIVE to localhost:8000 and verified me/rewards/offers/group-create/profile return matching shapes; nearby + business profile on seed pending backend endpoints.
- 2026-06-17 · F01 · Design pass: rebuilt all customer screens to the Jaqyn.dc.html canvas (QR onboarding with stamps/dual CTA, Home gradient closest-reward hero, Rewards filter chips + stamp-progress cards, reward detail shop header + info list + redemption code, Profile avatar card, Nearby search + category chips, business profile). Added shared kit (InitialTile, ListGroup, FilterChips, StampRow). Verified live in browser.
- 2026-06-17 · F01 · Nav + Nearby polish: replaced emoji nav with SVG line icons (added Campaigns tab → 6 customer tabs; business/staff navs too), made all shell headers cream (no white bar), rebuilt Nearby with a stylized map (roads/park/You marker/pins) and Open/Closed status + Nearest badge + per-business reward line. Backend: PublicBusinessSerializer now returns active reward. Verified live.
- 2026-06-17 · F01 · Added My QR (customer profile QR — new GET /api/customer/qr/ endpoint), a floating scan FAB → /scan (camera + manual → collect), and Group Deals + Campaigns entry cards on Home. Verified live.
- 2026-06-17 · BE · Added public business endpoints (GET /api/businesses/nearby/ + /{id}/) and additive business_name/business_area/customer_name fields to loyalty+groups serializers so customer/staff UIs show names; full backend suite still 44 passing.
- 2026-06-17 · F02 · Built business owner dashboard (register/approve-gated rewards+offers, merchant QR, customers, reports, staff approval code, settings) wired live via packages/api/business; owner auth via phone OTP.
- 2026-06-17 · F03 · Built staff PWA (PIN login, today code, html5-qrcode camera scan + manual fallback, redeem-once, group verify/redeem, recent activity) wired live via packages/api/staff. End-to-end owner->customer->staff loop verified 19/19 against running backend.
- 2026-06-17 · F00 · Restructured frontend to a single Next app (apps/web) + single container per request: 3 areas routed at /, /business, /staff, each with its own scoped PWA manifest; replaced 3 compose services with one `frontend` service and ARG-APP Dockerfile with a single-app build. build/lint/typecheck pass.
- 2026-06-17 · B06 · Added group-offer schema, business CRUD/status actions, admin approval REST/actions, public active listings, validation, migrations, and tests.
- 2026-06-17 · B07 · Added group deals, members, invite/join/leave/cancel, approval-code check-in, completion reward code, staff group redeem, expiry task, migrations, and lifecycle tests.
- 2026-06-17 · B08 · Added staff scan routing, recent activity, business-scoped staff group surfaces, and staff endpoint tests.
- 2026-06-17 · B09 · Added business reports/customers, masked phone lists, enhanced dashboard metrics, admin platform metrics, weekly report task, and metric tests.
- 2026-06-17 · B10 · Added notification preferences/logs, notifier abstraction, OTP/reward/group/report tasks, admin log endpoint, beat schedule wiring, and eager task tests.
- 2026-06-17 · B11 · Added admin audit logs, manual adjustments, user block, QR/business disable, group remediation, suspicious scan surfacing, backup/restore docs, and hardening tests.

---

## Open decisions / blockers
- SMS/OTP provider for Bishkek (B01/B10) — TBD; dev stub logs code.
- Owner auth: OTP-only for MVP vs email+password (F02/B01).
- ~~Design file `Jaqyn.dc.html` visual specs not extracted~~ — RESOLVED 2026-06-17: tokens (terracotta/cream/sage palette, Bricolage + Hanken fonts, pill buttons) extracted into frontend/packages/config/tailwind-preset.js; all screens restyled.
