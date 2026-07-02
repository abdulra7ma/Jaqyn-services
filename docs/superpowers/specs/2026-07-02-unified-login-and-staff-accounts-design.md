---
title: Unified login + password staff accounts + staff self-onboarding
service: backend + frontend
type: spec
status: active
last_reviewed: 2026-07-02
---

# Unified login + password staff accounts + staff self-onboarding

## Goal

Make it easy for a business owner to create staff accounts (no invite, no
email/SMS delivery) and make signing in simple for everyone via a single
identifier field. Staff complete their own profile on first login.

Three linked changes, shipped in one pass:

1. **Unified login** — one "phone or email" field; the backend decides whether
   the account signs in by OTP or password.
2. **Owner-created staff accounts** — owner adds a staffer with phone + role;
   the system creates the account, auto-generates a one-time password, and shows
   it once for the owner to relay. No invite record, no delivery.
3. **Staff self-onboarding** — on first login the staffer sets their name, a new
   password, and an optional avatar before entering the staff app.

## Non-goals

- SMS/email delivery of staff credentials (owner relays them out-of-band).
- Removing the `StaffInvite` model. Onboarding stops *using* it; the model and
  its admin stay for now (dead but not deleted — a follow-up can remove it).
- Changing customer phone+OTP signup behaviour.

## Current auth model (recap)

- `User.USERNAME_FIELD = "phone"`; `phone` unique/nullable, `email`
  unique/nullable, `avatar` ImageField already present.
- Password login (`accounts.services.authenticate_password`) is **email-only**.
- Phone login is **OTP-only** (`request_otp` / `verify_otp`); `verify_otp`
  `get_or_create`s a CUSTOMER for unknown phones (existing signup path).
- `StaffMember(business, user?, name, pin_hash?, role, is_active)` with
  `Role = {cashier, manager}`. `ensure_owner_staff` seats the owner as a MANAGER.
  `reset_staff_password` sets a temp password on a linked user and returns it
  once. There is **no create-staff endpoint** today.
- `CustomerProfile` already models `onboarding_completed` + `profile_completed`
  — the pattern mirrored below for staff.

## Feature 1 — Unified login

### Backend

- **New** `POST /api/auth/login/resolve` `{ identifier }` → `{ method }`:
  - `identifier` contains `@` → treat as email → `method = "password"`.
  - else treat as phone (normalize): if the matched `User` **has a usable
    password** → `method = "password"`; otherwise **send the OTP now** and
    return `method = "otp"` (also returns the `request_id`, same shape as
    `request_otp`).
  - Unknown phone → OTP path (preserves customer signup-on-verify).
  - `AllowAny`, throttled with the same scope as `request_otp`.
- **Generalize password auth**: `authenticate_password` (or a new
  `authenticate_identifier`) accepts phone **or** email + password. Email lookup
  unchanged; phone lookup by `phone=`. Same `INVALID_CREDENTIALS` on failure.
  The existing `/api/auth/login/password/` view accepts either identifier.
- Note: a staff/owner phone still *also* works via OTP (they own the number);
  `resolve` only picks the default UX. No OTP suppression for password accounts.

### Frontend (`app/login/page.tsx`)

- Replace the Phone/Email segmented tabs with **one identifier field** +
  Continue. On Continue → call `resolve`.
  - `method = "otp"` → show the existing OTP modal (code already sent).
  - `method = "password"` → reveal the password field → submit to password
    login with `{ identifier, password }`.
- Keep "forgot password" and social-soon blocks. All copy via `@jaqyn/i18n`.

### Security tradeoff (accepted, flagged)

`resolve` reveals whether an identifier is password-backed vs OTP-backed — mild
user enumeration. Accepted "for now"; mitigated only by throttling. Revisit if
abused.

## Feature 2 — Owner-created staff accounts

### Backend

- **New** `POST /api/business/staff/` (create; list/detail already exist on the
  staff-management surface). Owner-only (`IsBusinessOwner` / existing
  `_OwnerStaffMixin`). Throttled as a write endpoint.
- Input: `{ phone, role }` (`role ∈ {manager, cashier}`). `name` optional (staff
  usually fills it themselves).
- Service `create_staff_account(business, phone, role) -> (StaffMember, str)`:
  1. `transaction.atomic`.
  2. `get_or_create` `User(phone=...)` with `role = STAFF`.
     - If the user already exists **and** already has an active membership for
       this business → `CONFLICT` ("already on your team").
  3. Auto-generate a strong password (reuse the `reset_staff_password`
     generator), `set_password`, save.
  4. Create `StaffMember(business, user, name=user.name or "", role,
     is_active=True, profile_completed=False)`.
  5. Return the member + the plaintext password **once**.
- Response: the created team row + `temp_password` (plaintext, returned once,
  never stored/logged — mirrors `reset_staff_password`).

### Roles

Create/edit uses the real `StaffMember.Role` — **manager / cashier**. The old
invite roles (manager/staff/viewer) are dropped from the wizard.

### Frontend

- Shared create-staff form + hook (`useCreateStaffAccount`) used by **both**:
  - onboarding wizard **step 4** (replaces the invite UI + `staff-invites`
    calls), and
  - the post-onboarding **Staff** page (`/business/staff`).
- After create, show the one-time password in a copyable confirmation (dialog),
  with clear "you won't see this again — share it with the staffer" copy.
- Team list shows created staff as **"Not joined"** until `profile_completed`.

## Feature 3 — Staff self-onboarding on first login

### Data model

- **Add** `StaffMember.profile_completed: BooleanField(default=False)`.
  - Migration 1 (schema): add the nullable/defaulted column.
  - Migration 2 (data): backfill existing rows to `True` (already-working
    staff), and set `ensure_owner_staff` rows `True` going forward.
- Reuse `User.avatar` for the avatar (no new field).

### Backend

- `get_staff_for_user` already resolves the member. Expose `profile_completed`
  in the staff "me" payload the staff app reads.
- **New** `POST /api/staff/profile/complete/` (auth = logged-in staff):
  `{ name, new_password }` (+ optional avatar via a multipart avatar endpoint,
  or reuse an existing user-avatar upload if one exists). Sets `User.name`,
  `StaffMember.name`, `set_password(new_password)`, `profile_completed = True`,
  atomic. New password must meet the same rules as password reset.

### Frontend (staff app)

- Route gate: if the logged-in staff has `profile_completed = false`, redirect
  to `/staff/onboarding` before any other staff screen.
- `/staff/onboarding` screen: name (required), new password (required, replaces
  the temp), avatar (optional upload). On success → `/staff` (scan/home).
- Design-system components + `@jaqyn/i18n` copy.

## API surface summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login/resolve` | AllowAny (throttled) | Decide otp vs password; send OTP if otp |
| POST | `/api/auth/login/password/` | AllowAny (throttled) | Password login by phone **or** email |
| POST | `/api/business/staff/` | Owner | Create staff account, returns one-time password |
| POST | `/api/staff/profile/complete/` | Staff | Set name + password (+avatar), mark complete |

## Testing

- **resolve**: email→password; phone-with-password→password; phone-without→otp
  (+ OTP sent); unknown phone→otp. Throttle test.
- **password auth**: phone+password happy path; wrong password →
  `INVALID_CREDENTIALS`; email+password still works.
- **create staff**: creates User+StaffMember, returns password once; duplicate
  membership → conflict; owner-only permission test; sets `profile_completed=False`.
- **profile complete**: sets name/password/avatar, flips flag, changes login
  password (old temp no longer works); auth test.
- **gate**: staff with `profile_completed=false` is routed to onboarding
  (frontend test); completed staff goes straight in.
- Follow existing rules: endpoint auth+permission+happy-path; list endpoints
  assert query counts.

## Migration & rollout notes

- Two migrations for `profile_completed` (schema then data backfill), per the
  non-locking migration rule.
- No secrets in code. One-time passwords are generated, returned once, and only
  their hash persisted.
- `StaffInvite` becomes unused by onboarding but is left in place (deprecation is
  a separate change).
