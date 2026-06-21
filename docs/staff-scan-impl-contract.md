# Staff-Scan Loyalty — Implementation Contract (shared by all agents)

This is the single source of truth. Every agent reads this. Do NOT deviate from
the API shapes or i18n keys below — other agents depend on them exactly.

## Product flow (what we're building)
Replace "customer types staff approval code" with "staff scans the customer's
permanent personal QR". One scan earns a stamp / records spend / completes a card.
The customer's only job is **open app → show personal QR**. Customer screens just
reflect what the scan did (live via polling).

- **stamp / visit** program → scan awards +1 instantly.
- **spend** program → scan asks staff for the purchase amount, then records it.
- Completing a card → backend creates a redemption; staff taps **Confirm & give reward**.
- **One active earn-program per business** (no program picker).
- The SAME personal QR is shown on Collect AND Redeem screens — there is no
  separate customer-generated redemption QR in the new flow.

## Live vs mock
App runs mock-first (`NEXT_PUBLIC_USE_MOCKS`). The real cross-device flow needs the
live backend (polling). Rules:
- Any new method added to a typed api object MUST be implemented in BOTH the live
  impl and the mock impl, or TypeScript fails to compile.
- Mock impls simulate locally (in-memory) — cross-device sync is expected only in live mode.

---

## BACKEND CONTRACT

### New endpoint
`POST /api/staff/collect/`  — permission `IsStaff`
Request body: `{ "token": string, "amount"?: number }`
- `token` = a `customer_profile` QR token (the customer's personal QR).
- `amount` = purchase amount, only for `spend` programs.

Behavior (implement in a new service `staff_collect(staff, raw_token, amount=None, request=None)`
in `backend/apps/loyalty/services.py`, reusing `resolve_qr_token`,
`active_program_for_business`, `ensure_business_active`, `create_redemption`,
`check_collect_limits`, `RewardTransaction`):
1. Resolve token; require `type == customer_profile` else raise `INVALID_QR_TOKEN`.
2. `customer = token.customer`; `business = staff.business`; `ensure_business_active(business)`.
3. `program = active_program_for_business(business)`.
4. If existing progress for (customer, business, program) is `UNLOCKED` with a
   PENDING redemption → return **reward_ready** (idempotent; do not award again).
5. If `program.type == "spend"` and `amount is None` → return **needs_amount**.
6. Enforce cooldown/limits (`check_collect_limits`). On limit → return **already_counted**
   (catch `SCAN_LIMIT_REACHED`, do not 4xx).
7. Award inside a transaction:
   - spend: `current_spend += amount`; complete when `current_spend >= required_spend`.
   - else: `current_count += 1`; complete when `current_count >= target_count`.
   - Create `RewardTransaction` (action EARNED, source STAFF_MANUAL, staff=staff).
8. If completed → set progress UNLOCKED, `create_redemption(progress)` → return **reward_ready**.
   Else → return **awarded**.

### Response (wrap with `success_response(...)` as existing views do)
```json
{
  "state": "awarded | needs_amount | already_counted | reward_ready",
  "customer": { "name": "string" },
  "program": { "id": "uuid", "type": "stamp|visit|spend|...", "title": "string",
               "required_count": 6, "required_spend": null },
  "progress": { "current_count": 4, "target_count": 6, "current_spend": "0.00",
                "required_spend": null, "status": "active|unlocked" },
  "reward":  { "title": "Free coffee", "reward_description": "..." },   // null unless reward_ready
  "redemption": { "id": "uuid", "code": "ABCD1234" }                    // null unless reward_ready
}
```
`program`/`progress`/`customer` always present; `reward`/`redemption` only on reward_ready.

### Staff confirm reuses existing endpoint
"Confirm & give reward" → existing `POST /api/staff/redeem/` with `{ "code": redemption.code }`.
Do NOT change `redeem_reward`. Leave the old approval-code `collect_from_qr` path in place (unused by new flow).

### Files (BACKEND agent owns `backend/` only)
- `backend/apps/loyalty/services.py` — add `staff_collect(...)`.
- `backend/apps/staff/views.py` — add `StaffCollectView`.
- `backend/apps/staff/serializers.py` — add `StaffCollectSerializer` (`token` required, `amount` optional decimal ≥ 0).
- `backend/apps/staff/urls.py` — add `path("collect/", StaffCollectView.as_view(), name="staff-collect")`.
- Tests: `backend/apps/staff/tests/` (or loyalty tests) covering: stamp award, completion→reward_ready,
  spend needs_amount then award, already_counted on double-scan, wrong business, non-customer_profile token.
- Run `pytest` for the touched apps; must pass.

---

## FRONTEND FOUNDATION CONTRACT (FOUNDATION agent owns `packages/` only)

### `packages/api/src/staff/types.ts` — add
```ts
export type StaffCollectState = "awarded" | "needs_amount" | "already_counted" | "reward_ready";
export type StaffCollectResult = {
  state: StaffCollectState;
  customer: { name: string };
  program: { id: string; type: string; title: string; required_count: number | null; required_spend: string | null };
  progress: { current_count: number; target_count: number | null; current_spend: string; required_spend: string | null; status: string } | null;
  reward: { title: string; reward_description: string } | null;
  redemption: { id: string; code: string } | null;
};
```

### `packages/api/src/staff/api.ts` — add to live `staffApi`
```ts
collect: (body: { token: string; amount?: number }) =>
  api.post<StaffCollectResult>("/api/staff/collect/", body),
```
If a `mockStaffApi` exists, add a mock `collect` too (simulate: read/advance shared mock
progress; return awarded/needs_amount/reward_ready accordingly). If staff is live-only,
just add to `staffApi`. Keep `export type StaffApi = typeof staffApi` valid.

### `packages/api/src/staff/hooks.ts` — add
```ts
export const useStaffCollect = () =>
  useMutation({ mutationFn: (body: { token: string; amount?: number }) => staffApi.collect(body) });
```

### `packages/api/src/customer/hooks.ts` — enable polling
Give `useRewards` an optional poll: `useRewards(opts?: { refetchInterval?: number })` →
pass `refetchInterval` into the `useQuery`. Keep existing call sites working (param optional).
Do the same for `useMyQr` if trivial, else leave it.

### i18n — `packages/i18n/src/locales.ts` (add keys for EVERY locale present, e.g. en + ru)
Match the file's existing structure (nested vs flat — read it first). Add these keys with sensible RU translations:

Customer:
- `collect.title` = "Show this to collect"
- `collect.subtitle` = "Staff scan your code — nothing to type."
- `collect.progress` = "{count} of {total}"
- `qr.stampAddedNow` = "✓ Stamp added just now"
- `qr.stampAtHint` = "Your latest stamp appears here after staff scan."
- `qr.rewardReady` = "🎁 Your reward's ready!"
- `redeem.unlocked` = "🎁 Reward unlocked"
- `redeem.showToStaff` = "Show this to staff. They'll scan it and confirm from their device."
- `redeem.waiting` = "Waiting for staff to confirm…"
- `redeem.done` = "Redeemed!"
- `onboarding.welcomeSlide2` = "Just open your QR and let staff scan it — your stamp lands instantly."
- `onboarding.taskCollectStamp` = "Collect your first stamp"
- `groups.checkinHint` = "…by showing their personal QR — staff scan it at the counter."

Staff:
- `staff.collect.added` = "Stamp added"
- `staff.collect.count` = "{count} of {total}"
- `staff.collect.enterAmount` = "Enter purchase amount"
- `staff.collect.amountPlaceholder` = "0.00"
- `staff.collect.add` = "Add"
- `staff.collect.rewardReady` = "Reward ready"
- `staff.collect.confirmGive` = "Confirm & give reward"
- `staff.collect.alreadyCounted` = "Already added a moment ago"
- `staff.collect.redeemed` = "Redeemed"
- `staff.collect.errorWrongShop` = "This QR isn't from your shop"
- `staff.collect.scanHint` = "Point the camera at the customer's QR"

If the i18n lookup needs interpolation (`{count}`) and the lib doesn't support it, use plain
concatenation in components instead and keep the key as a template the component formats.

Run `pnpm --filter @jaqyn/api typecheck` and `pnpm --filter @jaqyn/i18n typecheck` (or build) — packages must compile.

---

## CUSTOMER SCREENS CONTRACT (CUSTOMER agent owns `apps/web/app/{collect,qr,rewards,scan,onboarding}` + customer-only `_components`)

Use only existing hooks + the FOUNDATION additions (`useMyQr`, `useRewards({refetchInterval:3000})`).
Read each file before editing; follow existing component patterns (`CustomerShell`, `Card`,
`QueryBoundary`, `InitialTile`, `useT`). Keys come from `packages/i18n/src/locales.ts` (above).

1. **NEW `apps/web/app/collect/page.tsx`** — "Show this to collect":
   - Shop card (active business) + customer's large personal QR (`useMyQr`) + member line +
     a live stamp-progress strip at the bottom (`useRewards({refetchInterval:3000})`).
   - Title `collect.title`, subtitle `collect.subtitle`. NO code input, NO submit, NO demo-code hint.

2. **`apps/web/app/qr/page.tsx`** — My QR:
   - Clean by default: QR + name + faint hint `qr.stampAtHint`. Remove any always-on hardcoded progress card.
   - Poll `useRewards({refetchInterval:3000})`; when a program's `current_count` increases, slide in a
     transient business-aware card "✓ Stamp added just now" (`qr.stampAddedNow`) + new count, auto-dismiss ~5s.
   - When a program completes (status unlocked), show "🎁 Your reward's ready!" (`qr.rewardReady`) and keep it until redeemed.

3. **`apps/web/app/rewards/page.tsx` + its `RewardCard`** — passive redeem:
   - For an unlocked reward: badge `redeem.unlocked`, the personal QR (`useMyQr`), `redeem.showToStaff`,
     and a pulsing `redeem.waiting`. Poll `useRewards({refetchInterval:3000})`; when that progress flips to
     `redeemed`, show `redeem.done` ("Redeemed!").
   - Remove the "Ask staff to confirm" button, the manual spinner step, and any "show the code" wording.

4. **`apps/web/app/scan/page.tsx`** — customers no longer scan-to-collect. Do not break the route; if it only
   served the old collect flow, repurpose its CTA to link to `/collect` (show-QR) or leave a minimal page.
   Do NOT delete `/q/[token]` (still used for first-scan business cards), just stop relying on the code path.

5. **`apps/web/app/onboarding/page.tsx`**:
   - Welcome carousel slide 2 copy → `onboarding.welcomeSlide2`.
   - "Collect your first stamp" task: opens `/collect` (show-QR) and auto-ticks when a stamp exists
     (detect via `useRewards` — any progress with `current_count > 0`). No code entry.

Do NOT edit `packages/**` or `apps/web/app/staff/**`. If you need a customer api method that doesn't exist,
STOP and note it — don't add to packages (FOUNDATION owns that).

---

## STAFF SCREEN CONTRACT (STAFF agent owns `apps/web/app/staff/**` only)

Read `apps/web/app/staff/scan/page.tsx`, `_components/StaffShell.tsx`, and `apps/web/app/_components/QrScanner.tsx` first.
Use `useStaffCollect` (FOUNDATION) + existing `useStaffRedeem`. Keys under `staff.collect.*`.

Rewrite the staff scan screen so a scan of a customer's personal QR drives the collect flow:
- Always-on `QrScanner`; on result → `useStaffCollect({ token })`.
- Render result as an overlay/card over the scanner, then auto-dismiss so the next customer can be scanned:
  - `awarded` → ✓ customer name + `staff.collect.added` + "X of Y" (`staff.collect.count`), auto-dismiss ~2s.
  - `needs_amount` → small popup: numeric input (`staff.collect.enterAmount`, placeholder `staff.collect.amountPlaceholder`),
    `staff.collect.add` → re-call `useStaffCollect({ token, amount })`.
  - `reward_ready` → customer name + `staff.collect.rewardReady` + reward title + big bottom-anchored
    `staff.collect.confirmGive` button → `useStaffRedeem({ code: result.redemption.code })` → show `staff.collect.redeemed`, dismiss.
  - `already_counted` → gentle `staff.collect.alreadyCounted` (not error-red).
  - error (wrong business/invalid) → red toast, plain copy (`staff.collect.errorWrongShop` for WRONG_BUSINESS).
- **Responsive: mobile AND web.** On wide viewports center the scanner in a max-width column (e.g. `max-w-md mx-auto`),
  keep overlays readable on desktop, primary CTA bottom-anchored on mobile and within the column on desktop.
  Match Jaqyn brand (warm terracotta/cream, existing tokens/components).
- Keep the staff login/shell/nav intact. Do NOT edit `packages/**` or customer screens.
- If you need a hook that doesn't exist, STOP and note it.

---

## INTEGRATION (orchestrator does last)
`pnpm --filter web typecheck`, `pnpm --filter web lint`, `pnpm --filter web build`, backend `pytest`.
