# Staff Scanner Redesign — Contract (round 2)

Goal: make the React staff app match the design deck `Jaqyn/Jaqyn.dc.html` (the
5 reference mockups the user supplied), and align the backend so the Stamp/Spend
program toggle works. The deck is the visual source of truth.

## Deck reference (READ THESE)
- Markup: `Jaqyn/Jaqyn.dc.html` lines **1009–1253** (the `isStaff` block: scan
  viewfinder, program pill + Stamp/Spend toggle, target frame, demo chips,
  camera-off, and the 6 result overlays, plus Groups & Activity tabs).
- State logic: same file lines **~2750–3320** (programLabel, keypad, spend pct,
  stamp dots, state machine: awarded/amount/reward/redeemed/already/error).

## What the staff scanner must look like (dark theme `#14100B`)
- Full-bleed dark camera view (use the REAL `QrScanner` for decoding; style the
  dark overlay/frame ON TOP — do NOT build fake demo customers).
- Top overlay: business avatar tile + business name + "{staffName} · cashier" +
  `STAFF` pill.
- Program row: a pill showing the current program label
  (`Stamp · Buy {n} get 1 free` or `Spend · {amount} SAR reward`) on the left,
  and a `Stamp | Spend` segmented toggle on the right. The toggle selects which
  program the scan awards. Only show toggle options for program types the business
  actually has; if only one program exists, show the pill and hide/disable the toggle.
- 228px target frame with 4 white corner brackets + animated amber scan line +
  faint QR cells; caption "Point at the customer's QR".
- Camera-off state: camera-off icon, "Camera is off", "Enable camera" button, and
  a manual "enter code" fallback (replaces the deck's demo chips for production).
- Six result overlays as bottom sheets (white, `border-radius:30px 30px 0 0`,
  rise animation), matching the deck exactly:
  1. **Awarded** — sage flash, ✓ circle, customer name, headline "Stamp added"
     (stamp) or "Payment added" (spend); stamp → row of dots (filled/empty,
     last = ★) + "X of Y"; spend → "X of Y SAR" + progress bar at pct;
     footer "Confirmed · ready for next".
  2. **Purchase amount** (spend, when needs_amount) — "Purchase amount", customer
     name + "spend {required} SAR for the reward", big `SAR {value}` display,
     3-col keypad (1-9, C, 0, ⌫), "Add" button (disabled until > 0). On Add →
     re-call collect with the amount.
  3. **Reward unlocked** — 🎁, name, "Reward unlocked", reward badge (cream/gold),
     "Hand the customer their reward, then confirm.", sage "Confirm & give reward"
     button, ghost "Not now" button.
  4. **Redeemed** — sage flash, ✓, "Redeemed", "{reward} · {name}".
  5. **Already added** — ↺ circle, "Already added", "{name} was scanned a moment
     ago — nothing to add yet.", "Got it".
  6. **Error** — ! circle, "Can't add this", "This code isn't from your shop. Ask
     the customer to open their Jaqyn code.", "Dismiss".
- Responsive: works on phone AND desktop web — center the device-width column on
  wide screens (the dark scanner stays a phone-width column, `max-w-[440px] mx-auto`),
  overlays bounded to that column.

## Staff bottom nav → 3 tabs (matches deck)
`Scan` → `/staff/scan` · `Groups` → `/staff/groups` · `Activity` → `/staff/activity`.
Drop the old "Код" (today-code) and "Выдать" tabs — approval codes are gone in the
new flow. Make `/staff` redirect to `/staff/scan`. Update `StaffShell` nav accordingly.
(Leave the today-code route file in place but unlinked; do not delete backend.)

---

## BACKEND CONTRACT (BACKEND agent — `backend/` only)
1. `staff_collect(staff, raw_token, amount=None, program_id=None, request=None)` —
   add `program_id` param, pass it to `active_program_for_business(business, program_id)`
   (that helper already accepts program_id). Everything else unchanged.
2. `StaffCollectSerializer` — add optional `program_id` (UUID/char, required=False).
   `StaffCollectView` passes it through.
3. NEW `GET /api/staff/programs/` (permission `IsStaff`) → list the staff business's
   ACTIVE reward programs:
   ```json
   { "programs": [ { "id": "uuid", "type": "stamp|visit|spend|...", "title": "...",
                     "required_count": 6, "required_spend": null,
                     "reward_description": "Free coffee" } ] }
   ```
   New `StaffProgramsView` in `backend/apps/staff/views.py`, route
   `path("programs/", StaffProgramsView.as_view(), name="staff-programs")`.
   Reuse `get_staff_for_user`. Order by `-created_at`.
4. Tests: program_id targets the right program when a business has both a stamp and
   a spend program; programs endpoint returns active programs for the staff's business.
   Run `docker compose exec -T web pytest apps/staff apps/loyalty -q` and report real output.

## FRONTEND CONTRACT (STAFF-FE agent — `frontend/` only)
Owns: `frontend/packages/api/src/staff/**`, `frontend/packages/i18n/src/locales.ts`,
`frontend/apps/web/app/staff/**`. (No other agent touches these this round.)

packages/api/src/staff:
- `types.ts`: add `StaffProgram = { id; type; title; required_count: number|null;
  required_spend: string|null; reward_description: string }`.
- `api.ts`: add `programs: () => api.get<{ programs: StaffProgram[] }>("/api/staff/programs/")`;
  extend `collect` body to `{ token; amount?; program_id? }`.
- `hooks.ts`: add `useStaffPrograms()` query; extend `useStaffCollect` body type with `program_id?`.

packages/i18n/src/locales.ts (en + ru): add all the staff strings the redesigned page
needs (program label templates, "Point at the customer's QR", "Stamp added",
"Payment added", "Confirmed · ready for next", "Purchase amount", "Add", "Reward unlocked",
"Hand the customer their reward, then confirm.", "Confirm & give reward", "Not now",
"Redeemed", "Already added", the already/error bodies, "Camera is off", "Enable camera",
"Can't add this", nav "Scan"/"Groups"/"Activity", "Stamp"/"Spend"). Reuse existing
`staff.collect.*` keys where they already exist (added in round 1). NO interpolation in
`useT` — format `{n}`/`{count}` in-component.

apps/web/app/staff:
- Rebuild `scan/page.tsx` to match the deck (above). Use real `QrScanner` for decoding;
  on result → `useStaffCollect.mutate({ token, program_id })`; render the 6 overlays.
  Spend keypad → re-call with `amount`. Reward_ready confirm → `useStaffRedeem.mutate({ code })`.
  Load programs via `useStaffPrograms`; drive the program pill + Stamp/Spend toggle from it;
  the selected program's id is sent as `program_id`.
- Update `_components/StaffShell.tsx` nav to Scan/Groups/Activity; make `/staff` redirect
  to `/staff/scan`.
- Keep it typechecking. Self-review against hook signatures; the orchestrator runs the
  final integrated `pnpm --filter web typecheck` + `lint`.

## INTEGRATION (orchestrator)
Backend pytest, `pnpm --filter web typecheck`, `pnpm --filter web lint`, then runtime
smoke on the live :3000 staff login (+996700000800 / OTP 000000).
