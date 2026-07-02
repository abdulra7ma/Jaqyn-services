title: Staff App Handoff — Implementation Plan
service: cross-cutting
type: spec
status: active
last_reviewed: 2026-07-02

# Staff app changes — dev handoff plan

Source: design handoff "Jaqyn Staff Changes" (prototype `Jaqyn.dc.html`). Five
changes to the cashier device, all following the campaigns restructure. This
plan maps prototype changes to the real monorepo and adjusts two workflows for
business value.

## Workflow adjustments (decided)

1. **One scan, earn or redeem.** `campaign-collect-redeem.md` flags the
   double-scan (collect vs redeem) as the highest-friction step. The handoff
   mock shows a redeem entry at the top of the customer-scan sheet. Backend
   adds the customer's active vouchers (campaign + loyalty) to the
   scan-customer response; staff redeems straight from the same sheet without
   a second scan.
2. **Group check-in QR gap.** `campaign-group-session.md` flags the group
   check-in token as possibly never minted — the customer may have nothing to
   present. Verify/fix so the group session exposes a scannable token and the
   unified scanner resolves it to the group sheet.
3. **Per-member check-in ticks are UI-only.** Staff tick members as a visual
   checklist; a single `confirm-group` call remains the only write. No
   per-member endpoint. (ponytail: add per-member API only if partial-arrival
   tracking becomes a real need.)

## Backend (Django)

### B1 — staff stats + activity feed (`apps/staff`)
- New `GET /api/staff/stats/` → `{scans_today, redemptions_today}` scoped to
  the staff member's business (timezone-aware "today"). Feeds the two stat
  tiles on Profile and Activity.
- Rework `GET /api/staff/recent-activity/`: one unified `events` list, each
  event carries `kind` (`redeem | stamp | visit | points | join | social`),
  masked customer name, label data, `created_at`. Add `kind` filter param and
  DRF pagination (default + hard max page size). Keep query count flat
  (`select_related`); assert with `django_assert_num_queries`.
- Tests: auth + permission + happy path + filter + pagination.

### B2 — unified scan surface (`apps/campaigns`, `apps/loyalty`)
- `scan-customer` / unified scan response: include the customer's ACTIVE
  vouchers for this business (campaign + loyalty) so the FE can offer
  redeem-from-scan. Redeem endpoints accept a voucher id resolved from that
  scan (staff business must own the voucher).
- Exclude GROUP-type campaigns from the chooser rows — groups complete via
  `confirm-group`, never via the add sheet.
- Verify group check-in token minting + resolution (workflow fix #2); repair
  if missing.
- Tests for each behavior change; docstrings updated with the logic.

## Frontend (`apps/web` staff app + `@jaqyn/api` + `@jaqyn/i18n`)

### F1 — nav, groups removal, profile
- `StaffNav` / `StaffShell`: drop the Groups tab (mobile + desktop). Bottom
  bar = Scan · Activity · Profile.
- `/staff/groups` → redirect to `/staff/scan` (stale sessions/bookmarks).
- Profile: add the two stat tiles (`GET /api/staff/stats/`), an account menu
  list incl. "Switch to owner view" (shown only when the user has an owner
  role), keep sign-out. Design per design-system (list rows, tiles).

### F2 — scan flow sheets
- Chooser sheet: redeem entry pinned on top when the scanned customer holds
  active vouchers (`🎁 Redeem reward … ›` → redeem confirm). Program rows
  restyled as a 3-tile grid (Points ⭐ / Stamps ☕ / Visits 📍 — big icon, one
  word); spend-basis points tile still opens the amount keypad. No group
  option in the sheet.
- Group sheet (`GroupEligibleSheet`): member list with check-in ticks
  (UI-only), leader marked, big `n/m checked in` count, one primary redeem
  action wired to `confirm-group`. Drop redundant subtitle/info box.
- Leaner result cards: cut helper sentences. New copy (ru + en):
  reward → drop "hand the customer…" line; earned → "Saved to their rewards";
  full wallet → "Ask them to use a reward first"; already → "{name} · just
  scanned"; error → "Not your shop's code".

### F3 — activity screen
- Two stat tiles up top (same stats endpoint), then filter chips
  All / Redeemed / Stamps / New driving the `kind` param, type-coded rows
  (gift = redeem, coffee = stamp/visit/points, person = join), empty-filter
  fallback line. Card list per design-system.

### D1 — docs
- Update `docs/workflows/staff-scan-unified.md`,
  `campaign-collect-redeem.md`, `campaign-group-session.md`,
  `loyalty-earn-redeem.md` + `docs/contracts/staff-profile-nav-contract.md`
  to the new flows (redeem-from-scan, no Groups tab, activity filters, stats).
  Refresh `docs/INDEX.md` rows touched (hand-edit; no generator exists).

## Order
Wave 1: B1 ∥ B2 → Wave 2: F1 → F2 → F3 (shared `locales.ts`/hooks, run
sequentially) ∥ D1 → Verify: `pytest`, `pnpm typecheck && lint`, live check.

Branch: `feat/staff-app-handoff`.
