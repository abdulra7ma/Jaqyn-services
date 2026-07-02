---
title: Staff Nav + Profile + Avatar + Language — Contract (round 3)
service: shared
type: contract
status: active
last_reviewed: 2026-07-02
---
# Staff Nav + Profile + Avatar + Language — Contract (round 3)

Four things (implemented in feat/staff-app-handoff):
1. **Consistent BOTTOM nav on every staff screen** — **3 tabs: Scan · Activity · Profile.**
   Groups tab removed; `/staff/groups` redirects to `/staff/scan`. Group check-in
   is a bottom sheet within the scan flow, not a top-level destination.
2. **New staff Profile page** — profile card (avatar + name + "role · business"),
   stat tiles, ACCOUNT section with a language row, logout. Avatar editing (emoji +
   photo) collapses behind an avatar tap. No business-details card, no
   notifications row, no "Switch to owner view" (dropped per design round 4).
3. **Move language out of the top header on ALL screens** (staff + customer) → into the profile page.
4. **Avatar = emoji picker AND photo upload** (user chose both).

---

## BACKEND CONTRACT (BACKEND agent — `backend/` only)

### User avatar fields
- Add to `User` (`backend/apps/accounts/models.py`):
  - `avatar = models.ImageField(upload_to="users/avatars/", blank=True, null=True)`
  - `avatar_emoji = models.CharField(max_length=8, blank=True, default="")`
- Generate the migration. (Business logos already use `ImageField`, so Pillow/media work.)

### Serializer
- `UserSerializer` (`backend/apps/accounts/serializers.py`): add `avatar` and `avatar_emoji`
  to fields. For `avatar`, return a RELATIVE url (`obj.avatar.url` → `/media/...`) via a
  `SerializerMethodField` (return `None` when empty). RELATIVE is required so the frontend
  same-origin `/media` proxy serves it on phones — do NOT return an absolute `localhost:8000` URL.

### Endpoints
- Emoji: add optional `avatar_emoji` (CharField, max_length 8, allow_blank) to
  `ProfileUpdateSerializer`; the profile-update view sets it on `request.user`. Setting a
  non-empty emoji should clear `avatar` (emoji takes over); confirm the update view works for
  STAFF users (no CustomerProfile) — it must still update user-level fields (name, avatar_emoji)
  without requiring a customer profile.
- Photo: NEW `POST /api/auth/avatar/` (authenticated, multipart) — field `avatar` (image file).
  Saves `request.user.avatar`, clears `avatar_emoji`, returns the updated `UserSerializer` data
  via `success_response`. Add the route in the accounts/auth urls (mirror existing auth routes).
  Add a `DELETE` or `avatar=null` path is NOT required.

### Media settings
- Confirm `MEDIA_URL = "/media/"` and `MEDIA_ROOT` set, and dev urls serve media
  (`static(settings.MEDIA_URL, ...)`) — business logos imply this exists; verify it covers
  user avatars too. If dev media serving is missing, add it.

### Tests
- Emoji update via profile endpoint persists `avatar_emoji` and clears photo.
- Avatar photo upload (use a tiny in-memory image / `SimpleUploadedFile`) sets `avatar`,
  serializer returns a `/media/...` relative url, and clears `avatar_emoji`.
- A STAFF-role user can update name + avatar_emoji through the profile endpoint.
- Run `docker compose exec -T web pytest apps/accounts apps/staff -q` (or venv equivalent) and
  report the real command + output. Run `python manage.py makemigrations --check` is NOT needed;
  just ensure the new migration file is created and `migrate` runs clean.

---

## FRONTEND CONTRACT (FRONTEND agent — `frontend/` only; owns packages + apps/web)

### Media proxy (so avatars load on phones via single origin)
- `apps/web/next.config.js`: add a rewrite `{{ source: "/media/:path*", destination: `${apiTarget}/media/:path*` }}`
  alongside the existing `/api` rewrite (same `apiTarget`).

### API layer (packages/api)
- `customer/types.ts` `User`: add `avatar: string | null` and `avatar_emoji: string`.
- `customer/api.ts`: add `uploadAvatar(file: File): Promise<User /*or Me*/>` →
  `POST /api/auth/avatar/` as multipart FormData (field `avatar`). Add to BOTH live and mock
  (mock: return a data URL via FileReader, or a placeholder). Check `packages/api/src/client.ts`
  — if it forces JSON, send the FormData with a direct `fetch` (no JSON content-type) so the
  browser sets the multipart boundary.
- `useUpdateProfile` body: add optional `avatar_emoji`. Add `useUploadAvatar()` mutation that
  invalidates the `me` query on success.

### Avatar display
- Add/extend an `Avatar` element: render the photo (`user.avatar`) if present, else the emoji
  (`user.avatar_emoji`) in a brand circle, else fall back to existing `InitialTile` (gradient initials).
  Use it in the staff profile, staff header, and customer profile avatar header.

### Consistent staff BOTTOM nav
- `apps/web/app/staff/_components/StaffNav.tsx`: a **floating white icon pill** —
  fixed `bottom-4`, centered, `rounded-pill bg-card shadow-modal`, **3 icon-only tabs —
  Scan (`/staff/scan`), Activity (`/staff/activity`), Profile (`/staff/profile`)** with
  `aria-label`s, active = brand accent, uses `usePathname`. No text labels, no theme
  prop (the pill stays white over both cream pages and the dark scanner). Groups tab
  removed; `/staff/groups` redirects to `/staff/scan`.
- `StaffShell.tsx`: REMOVE the top segmented `<nav>` and REMOVE `<LanguageSwitch/>` from the
  header. Render children, then `<StaffNav/>` floating at the bottom; add bottom
  padding so content clears the pill. Keep the business header (avatar + name + role + STAFF badge).
- `scan/page.tsx`: replace its inline bottom `<nav>` with `<StaffNav/>` (same tabs,
  now including Profile). Keep the dark immersive look; the pill floats white over it.

### New staff Profile page — `apps/web/app/staff/profile/page.tsx`
Use `StaffShell` (so it gets the bottom nav). Pull data from `useMe()` (`me.data.staff` →
business_name + role; `me.data.business` → name + status; `me.data.user` → name + avatar + avatar_emoji).
Also pulls `GET /api/staff/stats/` for stat tiles (`{scans_today, redemptions_today}`).
Sections (match the Jaqyn card style — Card, rounded, warm tokens), top to bottom:
- **Profile card**: big Avatar (photo/emoji/initials) + staff name + "role · business"
  subtitle. Tapping the avatar toggles the edit affordance: emoji-picker grid AND an
  "Upload photo" file input (`accept="image/*"`) → `useUploadAvatar`; selecting an emoji →
  `useUpdateProfile({ avatar_emoji })`. Collapsed by default so the card stays lean.
- **Stat tiles**: scans today + rewards given today (same tiles as the Activity screen).
- **ACCOUNT card**: a single language row (🌐 icon tile + label + styled `<select>` bound to
  `useI18n().locale` / `setLocale`). No notifications row, no "Switch to owner view" —
  both dropped per design round 4 (and /me can't flag owner access from the staff area anyway).
- **Sign out**: full-width `danger`-variant button.
- **Logout** button (ghost) → `staffAuth` logout / `tokenStore.clear()` then `router.replace("/staff/login")` (or "/").

### Move language off the top nav on CUSTOMER screens too
- `apps/web/app/_components/CustomerShell.tsx`: remove `<LanguageSwitch/>` from BOTH the mobile
  and desktop headers.
- `apps/web/app/profile/page.tsx` (customer profile): its language `<select>` must drive the LIVE
  locale — call `useI18n().setLocale(value)` on change (in addition to persisting via updateProfile),
  so removing the header switch doesn't strand users. Keep its design; this is the consistent
  language design to mirror on the staff profile.

### i18n (packages/i18n/src/locales.ts, en + ru)
Add: `staff.tab.profile`, staff profile section labels (Business/Company, Role, Language, Avatar,
"Upload photo", "Choose emoji", Logout), reuse existing `common.language`, `auth.logout`,
`common.save`, `staff.role.*` where present. NO interpolation.

### Verify
`cd frontend && corepack pnpm --filter @jaqyn/api typecheck && corepack pnpm --filter @jaqyn/i18n typecheck`
and self-review apps/web. Orchestrator runs the full `--filter web typecheck` + `lint`.

---

## INTEGRATION (orchestrator)
Backend pytest + migrate; `pnpm --filter web typecheck` + `lint`; runtime smoke on live :3000
staff login (+996700000800 / OTP 000000): every staff screen shows the same bottom nav with a
Profile tab, no language chip in any header, and the profile page renders business details, role,
avatar (emoji + photo), language select, logout.
