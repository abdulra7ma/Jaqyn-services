# Workflow Audit — Final Plan (2026-07-05)

Full audit of all three app areas. Every page mapped, wiring verified
against backend routes. Verdicts below; fixes broken out into FIX-NN files.

## Workflow map

### Customer (10 workflows)
| Workflow | Pages | Status |
|---|---|---|
| Signup/login/auth routing | /signup → /signup/email → /signup/complete → /onboarding → / (postAuthRoute gates on profile_completed + onboarding_completed) | OK |
| First-scan QR join | /q/[token] (public) → login/join → /qr | OK |
| Earn at counter | /collect (personal QR; /scan + /qr are alt entries) | OK |
| Redeem reward | /rewards (unified) · /campaign-wallet/[id] · polled 4s | OK |
| Campaigns hub | /campaigns → /campaigns/[id] → /campaigns/visit-qr | **BROKEN link (FIX-01)** |
| Group campaigns | /campaigns/[id]/group → …/group/invite | OK |
| Discovery | /campaigns/discover · /nearby (+ sheet) | OK |
| Loyalty cards | /loyalty (wallet), /loyalty/[id] | OK |
| Profile | /profile · /campaigns/patches | OK |
| Home | / (guest landing vs authed hero+rails) | OK |

### Business (14 workflows)
All wired to real endpoints; no dead endpoints found. Complete: activation,
pitch-claim, login, register, onboarding wizard (5 steps, autosave),
campaigns CRUD+lifecycle, loyalty CRUD+lifecycle, profile (8 sections), QR,
staff mgmt, reports, rewards view, customers list.
Partial: dashboard (activity feed placeholder — FIX-04), /business/more
(staff code UX — FIX-05), customers (no detail view — backlog).

### Staff (7 workflows)
Complete: login, onboarding gate, unified scan (customer/voucher/group/
social, keypad, loyalty-legacy fallback), activity feed, profile,
owner-as-staff switch. Broken: desktop scan redirect loop (FIX-02).
Note: `/api/staff/scan/` correctly routes to UnifiedStaffScanView
(config/urls.py:36 exact match) — the legacy StaffScanView in apps/staff is
shadowed dead code, NOT a runtime bug.

## Verdict

### Good (ship as-is)
- Auth is unified (one /login for all roles) with correct role/area routing.
- All money journeys wired to real endpoints end-to-end; no mock screens on main.
- Guards consistent: useRequireAuth / useRequireArea everywhere they're needed.
- Live-update polling (4s) on wallet/campaign/group screens — counter UX works.
- Camera unhappy paths (permission, HTTPS, manual fallback) handled in scanner.
- Duplication that looks intentional and is fine for launch: /rewards vs
  /campaign-wallet, /collect vs /qr, campaigns-hub vs discover.

### Bad (fix if time, won't block launch)
- Staff activity filter chips miss `points`/`social` kinds (FIX-06).
- Hardcoded EN strings on customer onboarding + scattered spots — hurts the
  RU-first launch (FIX-07).
- Camera-denied error gives no "how to enable" guidance (FIX-08).
- Pitch page support link hardcoded to t.me/jaqyn (FIX-09).
- Dead code: shadowed StaffScanView, unused staff hooks, unused
  staff.groups.* i18n keys (FIX-10).

### Critical (blocks a money journey — must fix before launch)
1. **FIX-01** New-customer starter mission "Show QR" → 404 (`/visit-qr`).
2. **FIX-02** Staff app unusable on desktop: /staff/scan ↔ /staff/groups
   infinite redirect loop.
3. **FIX-03** Ended/cancelled campaign detail is a dead end — no CTA, no
   explanation; confusing for customers mid-launch.
4. **FIX-04** Business dashboard "today's activity" is a hardcoded empty
   placeholder — first thing every new owner sees looks broken.

## Fix order (= CHECKPOINT order)

FIX-01 → FIX-02 → FIX-03 → FIX-04 → FIX-05 → FIX-06 → FIX-07 → FIX-08 →
FIX-09 → FIX-10. 01–04 are launch blockers; 05–08 strongly recommended;
09–10 only if time remains.

## Post-launch backlog (do NOT start now)

- Retire /business/more + BusinessShell; single responsive OwnerShell; move
  staff-code into Profile → Account.
- Consolidate /campaign-wallet into /rewards (one wallet surface).
- Consolidate /collect + /qr into one QR entry.
- /business/customers/[id] detail view (drill-down history).
- Onboarding-status visibility (pending/approved) on business dashboard.
- Autosave "saving…" indicator on business onboarding.
- Activity feed load-more; polling backoff when idle.
- Bulk actions on staff/customers tables.
- Loyalty settings: show disabled immutable fields with explanation.
- Persist locale preference across logout.
- Document NEXT_PUBLIC_ENABLE_TEST_UPLOAD as dev-only (verify unset in prod).
- Business-surface i18n (found in FIX-07 sweep, owner is concierge-onboarded
  so not launch-blocking): LocationPicker placeholders/aria, OwnerShell +
  BusinessShell aria-labels, business/staff close aria,
  business/activate page (mostly hardcoded EN incl. consent line),
  business/onboarding OnboardingFlow (extensive EN), MenuSection placeholder.
- guest.floating.* RU marketing copy — copywriter review (flagged in locales.ts).
