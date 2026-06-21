# F03 — Staff PWA

Phase: 2–4 · Scope: later · Depends on: F00, B03, B05, B07, B08

## Goal
Extremely simple cashier app with camera QR scanning + manual fallback everywhere.

## Screens (TBD §9.1) → endpoints
1. Staff Login/PIN → `POST /api/staff/login/` (business_code + PIN)
2. Staff Home
3. Today's Approval Code → `GET /api/staff/today-code/`
4. Scan QR → camera → `POST /api/staff/scan/`
5. Manual Code Entry → `POST /api/staff/redeem/manual-code/`
6. Redeem Reward → `POST /api/staff/redeem/`
7. Active Groups → `GET /api/staff/groups/`
8. Group Verification → `POST /api/staff/groups/{id}/verify/`
9. Recent Activity → `GET /api/staff/recent-activity/`
10. Report Issue

## QR scanning (TBD §16.2)
Browser camera API + reliable QR lib · works Android Chrome + iPhone Safari · HTTPS
· clear permission prompt · **manual code fallback on every scan screen** · clear
permission-denied handling.

## Acceptance (Sprint 2/3 staff test)
scan/enter code → redeem reward (no double redeem) · verify + redeem group ·
camera-denied path falls back to manual.

## Definition of Done
Big-button simple UI · success/error states obvious · works with camera off ·
localized · PWA installable.

## Implemented
Pages under `/staff` (routed area + bottom nav), wired live via the isolated
`frontend/packages/api/src/staff/` layer: PIN login (`business_code` + PIN, stores
JWT + staff profile), home with today's approval code, **scan** (camera via
`html5-qrcode`, dynamically imported, with a **manual code fallback always
visible**, camera-denied handling), redeem (no double-redeem — backend-guarded),
active groups (verify + give-reward), recent activity, logout.

QR lib: **html5-qrcode** (works Android Chrome + iPhone Safari; camera needs
HTTPS/localhost). The scanner parses a token out of a merchant URL or uses the raw
string. End-to-end redeem-once + group verify/redeem verified against the running
backend (19/19 flow checks).

## Checkpoint update
F03 = DONE, note QR lib + tested devices.
