"use client";

// Business owner dashboard (desktop + mobile), wired to /api/business/dashboard/.
// Metric cards read live metrics; the weekly chart + activity feed fall back to
// graceful empty states when there's no history yet. Design from Jaqyn.dc.html.

import { useBusinessMe, useDashboard, useBusinessRewards } from "@jaqyn/api";
import Link from "next/link";
import { OwnerShell } from "../_components/OwnerShell";

const CARD = "rounded-[18px] border border-line bg-card p-5";
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function BusinessDashboardPage() {
  const me = useBusinessMe();
  const dash = useDashboard();
  const rewards = useBusinessRewards();

  const m = dash.data?.metrics;
  const metrics = [
    { label: "Total customers", value: m?.customers ?? 0, sub: `+${m?.new_customers ?? 0} this month` },
    { label: "Scans this month", value: m?.total_scans ?? 0, sub: `${m?.scans ?? 0} recent`, accent: true },
    { label: "Returning", value: m?.returning_customers ?? 0, sub: "repeat customers" },
    { label: "Rewards redeemed", value: m?.rewards_redeemed ?? 0, sub: `${m?.rewards_issued ?? 0} issued` },
  ];
  const activeReward = rewards.data?.find((r) => r.is_active);

  return (
    <OwnerShell title="Dashboard">
      {me.isError ? (
        <div className={`${CARD} max-w-md`}>
          <p className="text-sm text-ink">No business yet — activate your owner invite to get started.</p>
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
                <div className="font-display text-base font-bold text-ink">Scans this week</div>
                <span className="text-[12.5px] text-subtle">{m?.total_scans ?? 0} total</span>
              </div>
              {(m?.total_scans ?? 0) === 0 ? (
                <div className="flex h-[160px] items-center justify-center text-[13.5px] text-subtle">
                  No scan history yet — it appears as customers visit.
                </div>
              ) : (
                <div className="mt-6 flex h-[160px] items-end gap-3">
                  {DAYS.map((d, i) => (
                    <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2.5">
                      <div className="w-full rounded-t-lg bg-[#E8CDA9]" style={{ height: "30%", borderRadius: "8px 8px 4px 4px" }} />
                      <div className="text-[11.5px] font-semibold text-subtle">{d}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[18px] border border-line bg-card p-[22px]">
              <div className="font-display text-base font-bold text-ink">Today&apos;s activity</div>
              <div className="flex h-[160px] items-center justify-center text-center text-[13px] text-subtle">
                Customer activity will show here as visits and redemptions happen.
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start justify-between gap-4 rounded-[18px] bg-brand-gradient p-[22px] text-brand-fg sm:flex-row sm:items-center">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.05em] opacity-85">
                {activeReward ? "Active loyalty program" : "No active loyalty program"}
              </div>
              <div className="mt-[7px] font-display text-xl font-bold">
                {activeReward?.title ?? "Set up your first reward"}
              </div>
              <div className="mt-1.5 text-[13px] opacity-90">
                {activeReward?.reward_description ?? "Reward repeat customers and bring them back."}
              </div>
            </div>
            <Link href="/business/rewards" className="flex-none whitespace-nowrap rounded-[13px] bg-card px-5 py-3.5 text-sm font-bold text-brand-deep">
              {activeReward ? "Manage program" : "Create program"}
            </Link>
          </div>
        </div>
      )}
    </OwnerShell>
  );
}
