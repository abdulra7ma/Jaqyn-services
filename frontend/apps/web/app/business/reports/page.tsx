"use client";

// Reports (OwnerShell design, responsive), wired live to /api/business/reports/.
// Three tabs — Overview / Retention / Staff performance — over a selectable period
// (Today / This week / This month / Custom). All numbers come from the backend
// report service; this file is presentational only (charts are token-styled divs).

import { useState } from "react";
import { useBusinessReports } from "@jaqyn/api";
import type {
  BusinessReport,
  ReportCohort,
  ReportKpi,
  ReportPeriod,
  ReportSeriesPoint,
  ReportStackedPoint,
  ReportStaffRow,
} from "@jaqyn/api";
import { OwnerShell } from "../_components/OwnerShell";
import { useAuth } from "../../_lib/auth";

const CARD = "rounded-[18px] border border-line bg-card";
const PANEL = `${CARD} p-5 sm:p-[22px]`;

type Tab = "overview" | "retention" | "staff";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "retention", label: "Retention" },
  { key: "staff", label: "Staff performance" },
];

const PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom" },
];

export default function BusinessReportsPage() {
  const { isAuthenticated, ready } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [range, setRange] = useState<{ date_from: string; date_to: string }>({ date_from: "", date_to: "" });

  const rangeReady = !!range.date_from && !!range.date_to;
  const reports = useBusinessReports(period, period === "custom" ? range : undefined);
  const report = reports.data;

  return (
    <OwnerShell title="Reports">
      {!ready ? null : !isAuthenticated ? (
        <div className={`${PANEL} max-w-md`}>
          <p className="text-sm text-subtle">Sign in to view your reports.</p>
        </div>
      ) : (
        <div className="mx-auto max-w-[980px] animate-[jqIn_.3s_ease]">
          {/* tabs + period selector */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Report sections">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`rounded-pill border px-4 py-2 text-[13px] font-semibold transition ${
                    tab === t.key ? "border-brand bg-brand text-brand-fg" : "border-line bg-card text-subtle hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Time period">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  aria-pressed={period === p.key}
                  className={`rounded-pill px-3.5 py-2 text-[12.5px] font-semibold transition ${
                    period === p.key ? "bg-brand text-brand-fg" : "text-subtle hover:text-ink"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {period === "custom" && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <DateField label="From" value={range.date_from} onChange={(v) => setRange((r) => ({ ...r, date_from: v }))} />
              <DateField label="To" value={range.date_to} onChange={(v) => setRange((r) => ({ ...r, date_to: v }))} />
            </div>
          )}

          <p className="mb-4 text-[12.5px] text-subtle">
            Showing data for <b className="text-ink">{report?.range_label ?? PERIODS.find((p) => p.key === period)?.label}</b>
          </p>

          {period === "custom" && !rangeReady ? (
            <div className={`${PANEL} text-center text-[13.5px] text-subtle`}>Pick a start and end date to see your report.</div>
          ) : reports.isError ? (
            <div className={`${PANEL} text-center text-[13.5px] text-danger`}>Couldn’t load reports. Try again.</div>
          ) : !report ? (
            <div className={`${PANEL} text-subtle`}>Loading reports…</div>
          ) : tab === "overview" ? (
            <Overview report={report} />
          ) : tab === "retention" ? (
            <Retention report={report} />
          ) : (
            <Staff report={report} />
          )}
        </div>
      )}
    </OwnerShell>
  );
}

// --------------------------------------------------------------------------- //
// Tabs
// --------------------------------------------------------------------------- //
function Overview({ report }: { report: BusinessReport }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {report.kpis.map((k) => (
          <KpiCard key={k.key} kpi={k} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ChartCard title="Scans over time">
          <BarChart points={report.scans_over_time} variant="brand" />
        </ChartCard>
        <ChartCard title="Busiest hours">
          <BarChart points={report.busiest_hours} variant="peak" />
        </ChartCard>
      </div>
      <Insights report={report} />
    </div>
  );
}

function Retention({ report }: { report: BusinessReport }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <ChartCard
          title="New vs returning"
          legend={
            <div className="flex gap-3.5 text-[12px] text-subtle">
              <LegendDot className="bg-brand" label="New" />
              <LegendDot className="bg-board" label="Returning" />
            </div>
          }
        >
          <StackedChart points={report.new_vs_returning} />
        </ChartCard>
        <ChartCard title="Customer mix">
          <div className="mt-4 flex flex-col gap-[18px]">
            {report.cohorts.map((c) => (
              <CohortBar key={c.label} cohort={c} />
            ))}
          </div>
        </ChartCard>
      </div>
      <Insights report={report} />
    </div>
  );
}

function Staff({ report }: { report: BusinessReport }) {
  const t = report.team_totals;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <TotalCard label="Scans validated" value={t.scans} />
        <TotalCard label="Rewards redeemed" value={t.redemptions} />
        <TotalCard label="New sign-ups" value={t.signups} />
        <TotalCard label="Active days" value={t.active_days} />
      </div>
      {report.staff.length === 0 ? (
        <div className={`${PANEL} text-center text-[13.5px] text-subtle`}>No staff activity in this period yet.</div>
      ) : (
        <div className={`${CARD} px-5 pb-3.5 pt-2 sm:px-[22px]`}>
          <div className="grid grid-cols-[2fr_1.4fr_1fr_0.8fr] gap-3 border-b border-line py-3 text-[11px] font-bold uppercase tracking-wider text-subtle">
            <div>Team member</div>
            <div>Scans validated</div>
            <div>Sign-ups</div>
            <div className="text-right">Trend</div>
          </div>
          {report.staff.map((m) => (
            <StaffRowView key={m.id} row={m} max={report.staff[0]?.scans ?? 1} />
          ))}
        </div>
      )}
      <Insights report={report} />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Pieces
// --------------------------------------------------------------------------- //
function KpiCard({ kpi }: { kpi: ReportKpi }) {
  return (
    <div className={`${CARD} p-[18px]`}>
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-subtle">{label(kpi.key)}</div>
        <Delta value={kpi.delta_pct} />
      </div>
      <div className="mt-2 font-display text-[26px] font-extrabold leading-none text-ink sm:text-[28px]">{kpi.value}</div>
      <div className="mt-1 text-[11.5px] text-subtle">{kpi.hint}</div>
    </div>
  );
}

function TotalCard({ label: l, value }: { label: string; value: number }) {
  return (
    <div className={`${CARD} p-[18px]`}>
      <div className="text-[12px] text-subtle">{l}</div>
      <div className="mt-2 font-display text-[26px] font-extrabold leading-none text-ink sm:text-[28px]">{value}</div>
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span className={`text-[12px] font-bold ${up ? "text-ok" : "text-danger"}`}>
      {up ? "+" : ""}
      {value}%
    </span>
  );
}

function ChartCard({ title, legend, children }: { title: string; legend?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between">
        <div className="font-display text-[16px] font-bold text-ink">{title}</div>
        {legend}
      </div>
      {children}
    </div>
  );
}

function BarChart({ points, variant }: { points: ReportSeriesPoint[]; variant: "brand" | "peak" }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const peakValue = Math.max(...points.map((p) => p.value));
  return (
    <div className="mt-5 flex h-[170px] items-end gap-2 sm:gap-2.5">
      {points.map((p, i) => {
        const isPeak = variant === "peak" && p.value === peakValue && p.value > 0;
        const fill = variant === "brand" ? "bg-brand-gradient" : isPeak ? "bg-brand" : "bg-board";
        return (
          <div key={`${p.label}-${i}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div
              className={`w-full rounded-t-lg ${fill}`}
              style={{ height: `${Math.max((p.value / max) * 100, p.value > 0 ? 4 : 1)}%` }}
              title={`${p.label}: ${p.value}`}
            />
            <div className="text-[11px] font-semibold text-subtle">{p.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function StackedChart({ points }: { points: ReportStackedPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.new + p.returning));
  return (
    <div className="mt-5 flex h-[190px] items-end gap-3 sm:gap-4">
      {points.map((p, i) => {
        const total = p.new + p.returning;
        return (
          <div key={`${p.label}-${i}`} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div className="text-[11px] font-bold text-ink">{total}</div>
            <div className="flex w-full flex-1 flex-col justify-end">
              <div className="w-full rounded-t-md bg-brand" style={{ height: `${(p.new / max) * 120}px` }} />
              <div className="w-full rounded-b-sm bg-board" style={{ height: `${(p.returning / max) * 120}px` }} />
            </div>
            <div className="text-[11.5px] font-semibold text-subtle">{p.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function CohortBar({ cohort }: { cohort: ReportCohort }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink">{cohort.label}</div>
        <div className="text-[13px] font-bold text-subtle">{cohort.count}</div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-pill bg-[#F1E7D6]">
        <div className="h-full rounded-pill bg-brand" style={{ width: `${cohort.pct}%` }} />
      </div>
    </div>
  );
}

function StaffRowView({ row, max }: { row: ReportStaffRow; max: number }) {
  return (
    <div className="grid grid-cols-[2fr_1.4fr_1fr_0.8fr] items-center gap-3 border-b border-line/60 py-3.5">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl font-display text-[14px] font-bold ${
            row.top ? "bg-brand text-brand-fg" : "bg-brand-muted text-brand"
          }`}
        >
          {initials(row.name)}
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
            {row.name}
            {row.top && (
              <span className="rounded-pill bg-brand-muted px-2 py-0.5 text-[10px] font-bold text-amber-deep">Top</span>
            )}
          </div>
          <div className="text-[12px] text-subtle">{row.role}</div>
        </div>
      </div>
      <div>
        <div className="font-display text-[15px] font-bold text-ink">{row.scans}</div>
        <div className="mt-1.5 h-[7px] w-[120px] max-w-full overflow-hidden rounded-pill bg-[#F1E7D6]">
          <div
            className={`h-full rounded-pill ${row.top ? "bg-brand" : "bg-board"}`}
            style={{ width: `${Math.round((row.scans / Math.max(1, max)) * 100)}%` }}
          />
        </div>
      </div>
      <div>
        <div className="font-display text-[15px] font-bold text-ink">{row.signups}</div>
        <div className="mt-0.5 text-[11px] text-subtle">{row.conversion_pct}% convert</div>
      </div>
      <div className="text-right">
        <Delta value={row.trend_pct} />
      </div>
    </div>
  );
}

function Insights({ report }: { report: BusinessReport }) {
  if (report.insights.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {report.insights.map((ins, i) => (
        <div key={i} className="flex items-center gap-3.5 rounded-[16px] bg-[#FBF3E6] p-[18px]">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-amber text-[19px]">{ins.icon}</div>
          <div className="text-[13.5px] leading-relaxed text-[#7A5A2A]">{ins.text}</div>
        </div>
      ))}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${className}`} />
      {label}
    </span>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-subtle">
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[10px] border border-line bg-card px-3 py-2 text-[13px] text-ink"
      />
    </label>
  );
}

// --------------------------------------------------------------------------- //
// Helpers
// --------------------------------------------------------------------------- //
function label(key: string): string {
  return key.replace(/_/g, " ").replace(/\bavg\b/i, "Avg.").replace(/\b\w/g, (c) => c.toUpperCase());
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
