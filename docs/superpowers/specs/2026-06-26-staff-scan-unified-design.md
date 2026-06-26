# Staff Scan — Unified One-Scan Flow

**Date:** 2026-06-26
**Status:** Approved (design)
**Branch:** feat/email-signup-otp (work to land on a dedicated branch off `main`)

## Problem

The staff scanner forces the operator to first pick a **mode** (visit vs redeem),
then on the collect path tap through an intermediate **eligibility list** to choose a
campaign before confirming. This is slow and error-prone at a counter. Separately, the
success/result card renders *underneath* the fixed bottom navigation bar, so its text
and action button are partially hidden behind the nav.

## Goals

1. **One continuous scan, no mode toggle.** The scanner auto-detects the QR type and
   routes to the right action.
2. **Collect = scan → preview → one Confirm.** A single confirm tap advances the base
   loyalty card *and every campaign the customer is currently enrolled in / eligible
   for* — no per-campaign tapping.
3. **Redeem = scan → preview → Confirm.** Unchanged behavior, now reached by
   auto-routing instead of a manual mode switch.
4. **Result card sits above the bottom nav**, fully readable.

## Non-Goals

- No new "smart scan" backend endpoint (see Approach B, rejected).
- No change to voucher minting, fraud rules, or campaign eligibility logic.
- No change to the customer-facing show-QR screens.

## Approach

**Chosen: Approach A′ — one read-only resolve endpoint + reuse existing apply endpoints.**

A QR token is an opaque value resolved server-side (`resolve_qr_token`); the frontend
cannot tell a `CUSTOMER_PROFILE` token from a `CAMPAIGN_REWARD` one locally. So routing
needs exactly one server round-trip. We add a single **read-only** dispatch endpoint
`POST /api/staff/campaigns/scan/` that resolves the token and returns a tagged preview —
`{kind: "customer", ...}` / `{kind: "voucher", ...}` / `{kind: "invalid", ...}` — with no
writes. The frontend branches on `kind` to open the right preview sheet, then calls the
**unchanged** apply endpoints (`/visit/` to collect, `/redeem-voucher/` to redeem). The
unified-visit service is extended to advance the right *set* of campaigns (see ADR).

Rejected: **chaining two failed calls** (try `scan-customer`, fall back to `scan-voucher`
on `INVALID_QR_TOKEN`). Zero new endpoints, but every voucher scan wastes a call and
writes a misleading `campaign_scan_customer` audit row — dishonest logs in a busy venue.
One clean resolve endpoint is worth the small addition.

Rejected: **Approach B — a single smart endpoint that also applies.** Folding the write
into the resolve removes the deliberate confirm-tap gate and reworks every apply path.
Larger blast radius for no gain; we keep resolve (read) and apply (write) as separate
seams.

## Flow

### Collect (customer personal QR — `CUSTOMER_PROFILE`)

```
Scan customer QR
  → POST /api/staff/campaigns/scan/   (resolve → {kind:"customer", preview}, no writes)
  → Preview sheet: base loyalty card progress + the campaigns that will advance
  → Staff taps "Confirm visit"  (single tap, no per-campaign selection)
  → POST /api/staff/campaigns/visit/   (advances loyalty + the campaign set per ADR)
  → Result card: per-leg deltas + any vouchers minted; auto-dismiss
```

### Redeem (campaign reward voucher — `CAMPAIGN_REWARD`)

```
Scan voucher QR
  → POST /api/staff/campaigns/scan/   (resolve → {kind:"voucher", preview|invalid}, no writes)
  → Valid → Redeem preview sheet; Invalid → error sheet
  → Staff taps "Redeem reward"
  → POST /api/staff/campaigns/redeem-voucher/  (ACTIVE → REDEEMED under lock)
  → Result card: redeemed; auto-dismiss
```

### Routing rule

The new resolve endpoint tags the token and the frontend branches on `kind`:

| Resolved `kind` | Destination sheet            |
|-----------------|------------------------------|
| `customer`      | Collect preview              |
| `voucher`       | Redeem preview / invalid     |
| `invalid`       | Error sheet                  |

The manual `ScanMode` toggle is removed entirely. Group-from-scan stays out of scope —
it is already unwired (`adaptVoucherScanResult` always returns `group: null`); group
confirmation continues to reach staff via the Groups tab, not the scanner.

## Backend Changes

`backend/apps/campaigns/services/scanner.py`

- **New `resolve_scan(staff, raw_token, request, now)` → `ScanDispatch`**: read-only.
  Resolves the token via `resolve_qr_token` (single audit action `staff_scan_resolve`),
  guards the business is active, and dispatches by `QRCodeToken.Type`:
  - `CUSTOMER_PROFILE` → reuse the `scan_customer_qr` eligibility body → `kind="customer"`
    carrying the existing `CustomerScanResult`.
  - `CAMPAIGN_REWARD` → validate via `CampaignRewardService.validate_reward_voucher`;
    valid → `kind="voucher"` with the voucher, a typed voucher error → `kind="invalid"`
    with the reason code (caught, not raised — an invalid voucher is a normal preview).
  - anything else → `kind="invalid"`.
  `ScanDispatch` is a frozen dataclass: `kind: Literal["customer","voucher","invalid"]`,
  `customer_result`, `voucher`, `reason_code` (only one payload set per kind).
- **`confirm_visit_unified`**: today it resolves a single prioritized campaign via
  `resolve_priority_campaign` and advances it. Change the campaign leg to advance the
  ADR-defined *set*:
  - Run the eligibility pipeline once for the customer at the staff's business.
  - **Stacking set**: every eligible campaign with `allow_multiple_campaign_counting=True`.
  - **One default**: among the eligible campaigns with
    `allow_multiple_campaign_counting=False`, pick exactly one via
    `resolve_priority_campaign` (passing the explicit `campaign_id` as `preferred` when
    given so a tapped campaign still wins).
  - Advance each chosen campaign through `confirm_visit` (its own atomic block + fraud
    check). A block on one (e.g. `CAMPAIGN_MIN_GAP`) does **not** abort the others.
  - When an explicit `campaign_id` is passed, advance **only** that one — preserves the
    single-target contract for any other caller.
- **`UnifiedScanResult`**: replace the single `campaign` / `campaign_skipped_reason`
  fields with `campaigns: list[ProgressResult]` (advanced) and
  `skipped_campaigns: list[SkippedCampaign]` (a frozen dataclass: campaign id, name,
  reason code). Keep the loyalty fields. Structured types throughout, never bare dicts.

`backend/apps/campaigns/serializers.py`

- Add `ScanDispatchSerializer` (emits `kind` + the matching nested payload:
  `CustomerScanResultSerializer` for customer, `CampaignRewardVoucherSerializer` for
  voucher, `reason` for invalid).
- Update `UnifiedScanResultSerializer`: `campaign` → `campaigns` (many) and add
  `skipped_campaigns` (id/name/reason).

`backend/apps/campaigns/views/staff_views.py` + `staff_urls.py`

- Add `ScanDispatchView` (POST, `IsStaff`, `campaign_scan` throttle, reuses
  `ScanCustomerSerializer` for input) wired at `campaigns/scan/`.

Docstrings updated in the same edit per backend rules.

## Frontend Changes

`frontend/apps/web/app/staff/scan/page.tsx`

- Remove `ScanMode` and the visit/redeem toggle UI.
- On decode, call a router that tries the resolve endpoints and branches on token type
  to set the overlay state.
- Collect preview sheet: render base loyalty + the full eligible-campaign list as a
  read-only summary with a single "Confirm visit" button (no per-row tap-to-select).
- Result sheet (`VisitUnifiedSheet`): render the loyalty leg plus a list of all
  advanced campaigns and any skipped ones (with reason), and any minted vouchers.

`frontend/packages/api/src/staff/{api,hooks,adapters,types}.ts`

- Update `UnifiedScanResult` type + adapter to the new `campaigns[]` /
  `skipped_campaigns[]` shape.
- `confirmVisitUnified` no longer needs a `campaignId` for the common path (still accept
  optional for the explicit single-target case).

### Result card above the bottom nav

Root cause: `StaffNav` is `fixed bottom-0 z-50`; the scan overlay/backdrop is
`absolute inset-0 z-45`, so the nav paints over the sheet's lower edge.

Fix (both, belt-and-suspenders):
1. Raise the scan overlay/backdrop to `z-[60]` so the sheet sits above the nav. The
   backdrop already dims the whole viewport, so covering the nav is consistent.
2. Add bottom padding to the sheet content equal to the nav height + safe-area inset, so
   the action button and last line of text always clear the nav region even if the nav
   remains visible underneath.

## Architecture Decision Record

### ADR: One scan advances the loyalty card + all stacking campaigns + one default campaign

**Decision.** A single collect scan advances, in one confirm:
1. the base loyalty card (always);
2. **every** eligible campaign with `allow_multiple_campaign_counting=True`;
3. **exactly one** prioritized campaign among the eligible campaigns with
   `allow_multiple_campaign_counting=False` (a tapped `campaign_id` wins that slot).

Not "advance every eligible campaign unconditionally," and not a per-campaign picker.

**Context.** The product intent is "one scan updates any campaign they're in." But the
`Campaign.allow_multiple_campaign_counting` boolean (default `False`) already encodes the
business's answer to "may one visit count toward several campaigns at once?" The field is
present on the model and serializers but **dormant** — no logic reads it; the scanner
always advances exactly one campaign today. Options weighed:
- *Advance one prioritized campaign* (today) — strands the other campaigns the customer
  is in; fails the goal.
- *Advance every eligible campaign unconditionally* — meets the goal but silently
  overrides `allow_multiple_campaign_counting`, double-counting one visit across
  campaigns a business deliberately set mutually exclusive.
- *Advance stacking campaigns + one default* (**chosen**) — meets the goal *and* honors
  the existing field: opt-in campaigns stack, default campaigns keep one-visit-one-stamp.

**Justification.**
- It activates an existing, documented business control instead of contradicting it. A
  business that wants a visit to feed several campaigns flips the toggle; the default
  stays conservative.
- Per-campaign min-gap fraud detection (`FraudService.detect_duplicate_visit`) guards each
  advanced campaign independently, so stacking adds no new abuse vector.
- Partial success is reported, not hidden — a min-gap-blocked campaign shows as skipped
  with its reason, so staff and audit logs stay truthful.

**Consequences.** `confirm_visit_unified` returns a *list* of campaign outcomes plus a
list of skipped ones; the result UI renders multiple legs. The explicit
single-`campaign_id` path is retained for backward compatibility. The dormant field
becomes load-bearing — campaign create/edit UI should eventually expose it, but that is
out of scope here (it already round-trips through the serializers).

## Testing

Backend (`backend/apps/campaigns/tests/`):
- Unified scan advances N eligible campaigns in one call (assert each progressed +
  loyalty progressed).
- Min-gap block on one campaign does **not** abort the others (one skipped, rest advance).
- Completion mints a voucher per completing campaign; all reported in the result.
- Auth + permission + happy-path for each touched endpoint; list-shaped responses assert
  query counts (`django_assert_num_queries`) to hold the N+1 line.

Frontend:
- Router selects the correct sheet per resolved token type (customer / voucher / group /
  invalid) — MSW-mocked.
- Collect preview renders all eligible campaigns and a single confirm button.
- Result sheet renders multiple advanced campaigns + skipped ones.
- Component/visual assertion that the result card clears the bottom nav (z-index +
  bottom padding present); ideally a Playwright check on the staff scan flow.

## Rollout

Behavioral change is staff-facing only. Land on a branch off `main`, PR with review, CI
green (lint + type-check + tests). No data migration. The OpenAPI schema regenerates for
the changed `UnifiedScanResult` shape.
