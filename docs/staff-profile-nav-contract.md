# Staff Nav + Profile + Avatar + Language — Contract (round 3)

Four things:
1. **Consistent BOTTOM nav on every staff screen** (currently scan = bottom icon nav,
   groups/activity = top segmented nav — inconsistent). Unify to ONE bottom nav, 4 tabs.
2. **New staff Profile page** — business details, role, avatar (emoji + photo), language, logout.
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
- New `apps/web/app/staff/_components/StaffNav.tsx`: a fixed/sticky BOTTOM nav, 4 tabs —
  Scan (`/staff/scan`), Groups (`/staff/groups`), Activity (`/staff/activity`), **Profile
  (`/staff/profile`)** — icon + label each, active = brand accent, uses `usePathname`.
  Accept a `theme?: "light" | "dark"` prop (dark for the scanner's immersive screen, light for
  the cream pages) but keep identical structure/icons/labels/position across both.
- `StaffShell.tsx`: REMOVE the top segmented `<nav>` and REMOVE `<LanguageSwitch/>` from the
  header. Render children, then `<StaffNav theme="light"/>` pinned to the bottom; add bottom
  padding so content clears the nav. Keep the business header (avatar + name + role + STAFF badge).
- `scan/page.tsx`: replace its inline bottom `<nav>` with `<StaffNav theme="dark"/>` (same tabs,
  now including Profile). Keep the dark immersive look.

### New staff Profile page — `apps/web/app/staff/profile/page.tsx`
Use `StaffShell` (so it gets the bottom nav). Pull data from `useMe()` (`me.data.staff` →
business_name + role; `me.data.business` → name + status; `me.data.user` → name + avatar + avatar_emoji).
Sections (match the Jaqyn card style — Card, rounded, warm tokens):
- **Avatar header**: big Avatar (photo/emoji/initials) + staff name + role. An "edit avatar"
  affordance: a small emoji-picker grid AND a "Upload photo" file input (`accept="image/*"`) →
  `useUploadAvatar`. Selecting an emoji → `useUpdateProfile({ avatar_emoji })`.
- **Business / company details**: business name, status badge, the staff member's role
  (`staff.role`), business id if useful. Read-only card.
- **Language**: a styled `<select>` bound to `useI18n().locale` / `setLocale` (NOT the old
  `LanguageSwitch` chip) — same visual design as the customer profile's language select so it's
  consistent. This is the new home for language on staff.
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
