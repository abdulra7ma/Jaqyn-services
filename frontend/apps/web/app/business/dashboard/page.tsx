"use client";

// Business owner dashboard (desktop + mobile), wired to /api/business/dashboard/.
// Metric cards read live metrics; the weekly chart + activity feed fall back to
// graceful empty states when there's no history yet. Design from Jaqyn.dc.html.

import type { ActivityEventKind } from "@jaqyn/api";
import { useBusinessMe, useDashboard } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { OwnerShell } from "../_components/OwnerShell";

const CARD = "rounded-[18px] border border-line bg-card p-5";
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// Kind → icon-tile glyph, mirroring the staff activity feed's mapping so the two
// surfaces read the same. Kinds come from the backend ActivityEvent enum.
const ACTIVITY_ICON: Record<ActivityEventKind, string> = {
  redeem: "🎁",
  stamp: "☕",
  visit: "📍",
  points: "⭐",
  social: "📢",
};

// Relative "time ago" in short units — same compact form the staff feed uses;
// no i18n string ops needed beyond the single-letter unit suffixes.
function fmtAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${Math.max(diff, 0)}с`;
  if (diff < 3600) return `${Math.floor(diff / 60)}м`;
  return `${Math.floor(diff / 3600)}ч`;
}

export default function BusinessDashboardPage() {
  const t = useT();
  const me = useBusinessMe();
  const dash = useDashboard();

  const m = dash.data?.metrics;
  const activity = dash.data?.activity ?? [];
  const metrics = [
    { label: t("owner.dashboard.totalCustomers"), value: m?.customers ?? 0, sub: `+${m?.new_customers ?? 0} ${t("owner.dashboard.thisMonth")}` },
    { label: t("owner.dashboard.scansMonth"), value: m?.total_scans ?? 0, sub: `${m?.scans ?? 0} ${t("owner.dashboard.recent")}`, accent: true },
    { label: t("owner.dashboard.returning"), value: m?.returning_customers ?? 0, sub: t("owner.dashboard.repeatCustomers") },
    { label: t("owner.dashboard.rewardsRedeemed"), value: m?.rewards_redeemed ?? 0, sub: `${m?.rewards_issued ?? 0} ${t("owner.dashboard.issued")}` },
  ];

  return (
    <OwnerShell title={t("owner.nav.dashboard")}>
      {me.isError ? (
        <div className={`${CARD} max-w-md`}>
          <p className="text-sm text-ink">{t("owner.dashboard.noBusiness")}</p>
        </div>
      ) : (
        <div className="flex animate-[jqIn_.3s_ease] flex-col gap-[18px]">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {metrics.map((mc) => (
              <div key={mc.label} className={CARD}>
                <div className="text-[12.5px] font-semibold text-subtle">{mc.label}</div>
                <div className="mt-3 font-display text-[28px] font-extrabold leading-none text-ink sm:text-[34px]">
                  {dash.isLoading ? "—" : mc.value}
                </div>
                <div className={`mt-2.5 text-xs font-semibold ${mc.accent ? "text-brand" : "text-subtle"}`}>{mc.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.5fr_1fr]">
            <div className="rounded-[18px] border border-line bg-card p-[22px]">
              <div className="flex items-center justify-between">
                <div className="font-display text-base font-bold text-ink">{t("owner.dashboard.scansWeek")}</div>
                <span className="text-[12.5px] text-subtle">{m?.total_scans ?? 0} {t("owner.dashboard.total")}</span>
              </div>
              {(m?.total_scans ?? 0) === 0 ? (
                <div className="flex h-[160px] items-center justify-center text-[13.5px] text-subtle">
                  {t("owner.dashboard.noScans")}
                </div>
              ) : (
                <div className="mt-6 flex h-[160px] items-end gap-3">
                  {DAYS.map((d, i) => (
                    <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2.5">
                      <div className="w-full rounded-t-lg bg-[#E8CDA9]" style={{ height: "30%", borderRadius: "8px 8px 4px 4px" }} />
                      <div className="text-[11.5px] font-semibold text-subtle">{t(`owner.dashboard.day.${d}`)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[18px] border border-line bg-card p-[22px]">
              <div className="font-display text-base font-bold text-ink">{t("owner.dashboard.todayActivity")}</div>
              {activity.length === 0 ? (
                <div className="flex h-[160px] items-center justify-center text-center text-[13px] text-subtle">
                  {t("owner.dashboard.activityEmpty")}
                </div>
              ) : (
                <ul className="mt-4 flex flex-col gap-2.5">
                  {activity.map((event) => (
                    <li key={event.id} className="flex items-center gap-3.5">
                      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-tile text-lg" aria-hidden>
                        {ACTIVITY_ICON[event.kind]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink">
                          {event.customer || t(`staff.activity.kind.${event.kind}`)}
                        </div>
                        <div className="truncate text-xs text-subtle">
                          {event.label || t(`staff.activity.kind.${event.kind}`)}
                        </div>
                      </div>
                      <div className="flex-none text-xs font-semibold text-subtle">{fmtAgo(event.created_at)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-col items-start justify-between gap-4 rounded-[18px] bg-brand-gradient p-[22px] text-brand-fg sm:flex-row sm:items-center">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.05em] opacity-85">
                {t("owner.dashboard.loyaltyProgram")}
              </div>
              <div className="mt-[7px] font-display text-xl font-bold">
                {t("owner.dashboard.manageRewards")}
              </div>
              <div className="mt-1.5 text-[13px] opacity-90">
                {t("owner.dashboard.manageRewardsHint")}
              </div>
            </div>
            <Link href="/business/rewards" className="flex-none whitespace-nowrap rounded-[13px] bg-card px-5 py-3.5 text-sm font-bold text-brand-deep">
              {t("owner.dashboard.manageProgram")}
            </Link>
          </div>
        </div>
      )}
    </OwnerShell>
  );
}
