"use client";

// Rewards / Redemptions (campaigns-restructure design §6). This is a redemption-
// tracking view, NOT a loyalty builder — loyalty is now an Individual campaign.
// It surfaces the rewards-issued / rewards-redeemed KPIs across all campaigns and
// links into each campaign's Reward Usage tab where the per-voucher history lives.

import { useBusinessCampaigns } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { OwnerShell } from "../_components/OwnerShell";
import { KpiCard, StatusPill, TypeBadge, TYPE_GLYPH } from "../_components/campaigns";
import { QueryBoundary } from "../../_components/QueryBoundary";

export default function RewardsRedemptionsPage() {
  const t = useT();
  const list = useBusinessCampaigns();

  return (
    <OwnerShell title={t("owner.nav.rewards")}>
      <div className="animate-[jqIn_.3s_ease]">
        <QueryBoundary
          query={list}
          isEmpty={(d) => d.campaigns.length === 0}
          emptyMessage={t("cmp.biz.empty")}
        >
          {(data) => (
            <>
              <div className="grid grid-cols-2 gap-4">
                <KpiCard label={t("cmp.biz.kpi.issued")} value={String(data.summary.rewards_issued)} />
                <KpiCard
                  label={t("cmp.biz.kpi.redeemed")}
                  value={String(data.summary.rewards_redeemed)}
                />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.campaigns.map((row) => (
                  <Link
                    key={row.id}
                    href={`/business/campaigns/${row.id}`}
                    className="flex items-center gap-3 rounded-[18px] border border-line bg-card p-[18px] transition hover:border-brand/40"
                  >
                    <div
                      className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-muted text-xl"
                      aria-hidden
                    >
                      {row.glyph || TYPE_GLYPH[row.type]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14.5px] font-bold text-ink">{row.name}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <TypeBadge type={row.type} />
                        <StatusPill status={row.status} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-[20px] font-extrabold leading-none text-ink">
                        {row.type_stats.stat_b.value}
                      </div>
                      <div className="mt-1 text-[11.5px] text-subtle">{row.type_stats.stat_b.label}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </QueryBoundary>
      </div>
    </OwnerShell>
  );
}
