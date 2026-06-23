# Business Reports Revamp — Plan

Replace the placeholder business Reports page (a flat grid of the `business_metrics`
map) with the designed Reports experience from `Jaqyn.dc.html`: a tabbed,
period-filterable analytics view (Overview / Retention / Staff performance) backed
by a real reporting service. Wired end-to-end to live APIs.

Design source: `Jaqyn.dc.html` → `// ---- REPORTS ----` block (`biz.report`,
`repKpis`, `series`, `hourBars`, `nrBars`, `cohorts`, `staffPerf`, `repInsights`).

Scope decisions (confirmed with owner):
- **Spend captured at scan.** Staff collect already accepts an optional `amount`;
  we persist it as `amount_spend` on count-program EARNED transactions too (today
  it is only stored for spend programs). Spend KPIs render `—` until data exists.
- **Drop staff "hours on shift" and "rating"** (no data source). Replace the 4th
  team-total card with **Active days** (distinct days the team validated a scan) —
  cheap to derive from `ScanLog`.

---

## 1. Data inventory — what exists, where it comes from

All metrics derive from existing models; **no new tables** are required.

| Report element | Source model / field | Aggregation | Notes / gaps |
|---|---|---|---|
| Repeat purchase rate | `ScanLog(status=success, customer)` | customers with ≥2 distinct visit-days ÷ total customers | visit = distinct (customer, day) |
| Avg. visit frequency | `ScanLog` | total visits ÷ distinct customers | "×" |
| Reward redemption rate | `RewardRedemption.status` | `REDEEMED` ÷ all redemptions created in range | "claimed ÷ earned" |
| Avg. spend / visit | `RewardTransaction.amount_spend` (EARNED) | Σ spend ÷ visits | **gap → captured at scan**; `—` if none |
| Est. customer value (CLV) | `RewardTransaction.amount_spend` (all-time) | Σ lifetime spend ÷ distinct members | `—` if none |
| Enrollment rate | `CustomerRewardProgress` vs `ScanLog` | customers w/ progress created in range ÷ customers who scanned | "walk-ins joining" |
| Scans over time | `ScanLog.created_at` | bucket by day (week/custom/month) or hour (today) | adaptive labels |
| Busiest hours | `ScanLog.created_at` hour | 2-hour buckets 7a–7p | matches mockup's 7 bars |
| New vs returning | `ScanLog` first-scan per customer | per-month over last 6 months | new = first-ever scan that month |
| Customer mix (cohorts) | `ScanLog` distinct visit-days per customer | New 0–1 / Returning 2–4 / Loyal 5+ | counts + pct |
| Staff: scans validated | `ScanLog(staff=member, status=success)` | count in range | `staff` FK already on `ScanLog` ✓ |
| Staff: sign-ups | `ScanLog` first-ever scan attributed to staff | distinct new customers whose first scan = this member, in range | attributable proxy |
| Staff: redemptions | `RewardRedemption(redeemed_by=member, status=REDEEMED)` | count in range | `redeemed_by` FK ✓ |
| Staff: conversion | derived | sign-ups ÷ scans | |
| Staff: trend | `ScanLog` this vs previous period | Δ% | replaces rating |
| Team total: active days | `ScanLog(staff__isnull=False)` | distinct `TruncDate` | replaces "hours on shift" |
| Insights | derived | close-to-reward count, peak hour, at-risk loyal (no scan 30d) | plain text (no HTML) |
| Period deltas (`+15%`) | each KPI recomputed for previous equal-length period | Δ% vs baseline; `null` when no baseline | |

Deltas: each KPI is recomputed for the immediately-preceding window of equal length;
`delta_pct = round((cur - prev) / prev * 100)`, `null` when `prev` is 0/unavailable.

---

## 2. Backend plan (`apps/reporting`, `apps/loyalty`)

### 2.1 Spend capture (`apps/loyalty/services.py`)
- In `staff_collect`, the **count-program** EARNED `RewardTransaction.create(...)` adds
  `amount_spend=amount` (currently only the spend branch stores it). `amount` is already
  a `staff_collect` param fed by `StaffCollectSerializer.amount`. Nullable → safe.
- Docstring updated to state spend is recorded for count programs when provided.
- Test: count-program collect with `amount` persists `amount_spend`.

### 2.2 Report service (`apps/reporting/business_reports.py` — new module)
Keep admin/business-action logic in `services.py`; the report builder is its own
module (the service module is already near the size smell). Public surface:

- `@dataclass(frozen=True)` types: `Kpi`, `SeriesPoint`, `StackedPoint`, `Cohort`,
  `StaffRow`, `TeamTotals`, `Insight`, `BusinessReport`. No bare dicts cross the boundary.
- `resolve_period(period, date_from, date_to) -> ReportWindow` — returns
  `(start, end, prev_start, prev_end, label, bucket)`. Timezone-aware, UTC stored.
  `period ∈ {today, week, month, custom}`; `custom` requires `from`/`to`.
- `build_business_report(business, window) -> BusinessReport` — one function, helpers
  per section. Each section uses a single grouped aggregation (`values().annotate()`),
  no ORM calls in loops, `select_related` where rows are materialized.
- Raises `ValidationError` (core hierarchy) on a bad custom range (missing/`from>to`).
- Every function carries a docstring stating the rule it enforces (e.g. "a visit is a
  distinct customer-day"); magic windows (2-hour buckets, 6-month trend, 80%
  close-to-reward, 30-day at-risk) are named constants with a `# why` comment.

### 2.3 Views / serializers (`apps/reporting/views.py`, `serializers.py`)
- `ReportQuerySerializer` (shape validation): `period` (choice, default `month`),
  `date_from`/`date_to` (date, optional). Business-rule validation (range sanity)
  stays in the service.
- `BusinessReportSerializer` + nested serializers render the dataclass (read-only,
  attribute source). Structured output — no hand-built dict in the view.
- `BusinessReportsView.get` parses query → `resolve_period` → `build_business_report`
  → serialize. Zero business logic in the view. `permission_classes=[IsBusinessOwner]`.
  Single-object GET (no pagination needed); default throttles apply.
- URL unchanged: `GET /api/business/reports/?period=&date_from=&date_to=`.

### 2.4 Tests (`apps/reporting/tests/test_reporting.py`)
- Auth (401) + permission (non-owner 403) + happy path (200, all sections present).
- `django_assert_num_queries` bound on the endpoint (N+1 guard).
- Repeat-purchase / redemption-rate / busiest-hours / new-vs-returning correctness
  on a seeded fixture.
- Staff performance attribution (scans/sign-ups/redemptions/trend) for 2 staff.
- Period filter (`today` vs `month` return different windows) + custom-range validation.
- Spend KPIs `—` with no spend, numeric after a spend-carrying collect.

---

## 3. Frontend plan (`apps/web`, `packages/api`)

### 3.1 API layer (`packages/api/src/business`)
- `types.ts`: `BusinessReport` and member types (`ReportKpi`, `ReportSeriesPoint`,
  `ReportStackedPoint`, `ReportCohort`, `ReportStaffRow`, `ReportTeamTotals`,
  `ReportInsight`, `ReportPeriod`). Explicit, no `any`.
- `api.ts`: `reports(period, range?) => api.get<BusinessReport>("/api/business/reports/?…")`.
- `hooks.ts`: `useBusinessReports(period, range?)` keyed `bqk.reportsByPeriod(period, range)`;
  `staleTime` so tab/period switches don't thrash. Replaces the param-less hook.
- Parse the envelope shape at the boundary (adapter/zod) before trusting types inward.

### 3.2 Reports page (`app/business/reports/page.tsx` — rewrite)
Renders the three tabs from the mockup, all from live data:
- **Header controls:** Overview/Retention/Staff tabs + Today/This week/This month/Custom
  period pills (custom reveals two date inputs). "Showing data for {label}".
- **Overview:** 6 KPI cards (value + colored Δ + hint), `Scans over time` bar chart,
  `Busiest hours` bar chart, derived insight callouts.
- **Retention:** `New vs returning` stacked bars + legend, `Customer mix` cohort bars,
  insight callout.
- **Staff performance:** 4 team-total cards (Scans validated, Rewards redeemed,
  New sign-ups, **Active days**), per-member table (scans+bar, sign-ups+conversion,
  redeemed, trend), insight callout.
- Pure presentational charts built with divs + Tailwind tokens (`brand`, `card`,
  `line`, `subtle`, `ink`, `amber`) — no chart lib, matching the mockup. Loading and
  empty states per section. Insights are plain text (no `dangerouslySetInnerHTML`).
- `'use client'` page (interactive tabs/period) inside `OwnerShell`; small components
  co-located. Match existing business-page style (the app does not route this surface
  through `@jaqyn/i18n` today — stay consistent, do not introduce a one-off).

### 3.3 (Optional, follow-up) staff collect amount input
Spend KPIs only fill once staff enter an amount on count-program collects. The staff
scan/collect screen can surface an optional "Amount (som)" field. Out of the Reports
page's critical path; noted so the data path is understood end-to-end.

---

## 4. Verification
- Backend: `pytest apps/reporting apps/loyalty`, mypy, ruff.
- Frontend: `tsc --noEmit`, lint; run dev server and confirm the three tabs render
  live data, period switch refetches, spend cards show `—` until a spend collect.
