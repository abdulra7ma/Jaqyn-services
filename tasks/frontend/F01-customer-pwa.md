# F01 — Customer PWA

Phase: 1–4 · Scope: later · Depends on: F00, B01–B07

## Goal
Mobile-first customer app. Entry = scanning a merchant QR or opening a group link.

## Screens (TBD §7.1) → endpoints
1. QR Landing `/q/{token}` → `GET /api/qr/{token}/`
2. Phone Login → `POST /api/auth/request-otp/`
3. OTP Verification → `POST /api/auth/verify-otp/`
4. Customer Home → `GET /api/auth/me/`
5. My Rewards → `GET /api/customer/rewards/`
6. Reward Details → `GET /api/customer/rewards/{id}/`
7. Reward Redemption Code → `POST .../generate-redemption-code/`
8. Group Offers List → `GET /api/group-offers/`
9. Group Offer Details → `GET /api/group-offers/{id}/`
10. Create Group → `POST /api/groups/`
11. Group Page → `GET /api/groups/{invite_token}/`
12. Join Group → `POST /api/groups/{id}/join/`
13. Invite Friends (share links)
14. Group Check-In → `POST /api/groups/{id}/check-in/`
15. Reward Unlocked (success)
16. Group Failed/Expired (state)
17. Nearby Businesses
18. Business Profile
19. Profile/Settings → `PATCH /api/auth/profile/`

## Bottom nav
Home · Rewards · Groups · Nearby · Profile.

## Key flows
- Collect: QR landing → (login if needed, return to landing) → "Collect Reward" →
  enter staff approval code → `POST /api/qr/{token}/collect/` → progress/unlock screen.
- Group: offer → create/join → invite (share) → check-in at merchant.
- Auth guard: 401 → login, preserve return URL (deep-link back to QR/group).

## Acceptance
Full collect loop + full group loop work on Android Chrome & iPhone Safari · every
screen has loading/empty/error · share buttons work · no app install required.

## Definition of Done
All screens wired to real API · localized (ru/en) · error codes mapped · PWA.

## API layer (implemented)
All network access lives in `frontend/packages/api/src/customer/` — screens never
call `fetch`/endpoints directly:
- `api.ts` — `CustomerApi` interface + `liveCustomerApi` (real backend) +
  `mockCustomerApi` (in-memory seed). Selected by `NEXT_PUBLIC_USE_MOCKS`
  (**default = LIVE**, `"true"` → mock for offline/demo).
- `adapters.ts` — maps raw backend payloads → UI domain types. Absorbs three
  backend realities: list endpoints wrap `{results:[…]}`; `business` is a bare
  UUID in rewards/offers/groups; group membership flags are derived from the
  current user id (`session.ts`).
- `hooks.ts` — TanStack Query hooks; `errors.ts` maps error `code` → localized.

Verified live against the running backend (`localhost:8000`): me, profile PATCH,
customer rewards, group-offers list+detail, group create→fetch — all 200, shapes
match the adapters.

### Backend gaps to close (not blocking the UI)
- No public business list / profile endpoint → **Nearby** + **Business profile**
  screens currently served from seed data (`listNearby`/`getBusiness` fall back to
  mock). Need `GET /api/businesses/nearby/` + `GET /api/businesses/{id}/`.
- Customer reward/offer/group serializers return `business` as a UUID only (no
  name) and group members as `customer` UUID (no name) → cards degrade (hide the
  business name; member shown as short id). Recommend embedding `{id,name}`.

## Checkpoint update
F01 = DONE, note which loops verified on which devices.
