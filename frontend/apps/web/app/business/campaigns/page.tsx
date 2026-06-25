"use client";

// Business campaigns — List (plan §2.4, design BUSINESS · list). 4 KPI cards plus
// the campaign table (status / participants / completed / redeemed / ends), wired to
// useBusinessCampaigns. Replaces the former neighborhood-campaigns placeholder.

import { useBusinessCampaigns, type BusinessCampaignRow } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OwnerShell } from "../_components/OwnerShell";
import { KpiCard, StatusPill, TYPE_GLYPH } from "../_components/campaigns";
import { QueryBoundary } from "../../_components/QueryBoundary";

const TABLE_COLS = "grid grid-cols-[2.4fr_1fr_1fr_1fr_1fr_1fr] items-center";

function CampaignRow({ row }: { row: BusinessCampaignRow }) {
  const t = useT();
  return (
    <Link
      href={`/business/campaigns/${row.id}`}
      className={`${TABLE_COLS} cursor-pointer border-b border-[#F4ECDF] px-[22px] py-4 transition hover:bg-cream/60`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-muted text-xl"
          aria-hidden
        >
          {row.glyph || TYPE_GLYPH[row.type]}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-bold text-ink">{row.name}</div>
          <div className="text-xs text-subtle">{t(`cmp.type.${row.type}`)}</div>
        </div>
      </div>
      <span>
        <StatusPill status={row.status} />
      </span>
      <span className="text-sm font-semibold text-ink">{row.participants}</span>
      <span className="text-sm font-semibold text-ink">{row.completed}</span>
      <span className="text-sm font-semibold text-ink">{row.redeemed}</span>
      <span className="text-[13px] text-subtle">{row.ends_label}</span>
    </Link>
  );
}

export default function BusinessCampaignsPage() {
  const t = useT();
  const router = useRouter();
  const list = useBusinessCampaigns();

  return (
    <OwnerShell title={t("cmp.biz.title")}>
      <div className="animate-[jqIn_.3s_ease]">
          <div className="mb-5 flex items-center justify-between gap-4">
            <p className="text-[13.5px] text-subtle">{t("cmp.biz.subtitle")}</p>
            <button
              onClick={() => router.push("/business/campaigns/new")}
              className="flex flex-none items-center gap-2 rounded-xl bg-brand px-[18px] py-3 text-[13.5px] font-bold text-brand-fg shadow-glow transition active:scale-[.99]"
            >
              + {t("cmp.biz.create")}
            </button>
          </div>

          <QueryBoundary
            query={list}
            isEmpty={(d) => d.campaigns.length === 0}
            emptyMessage={t("cmp.biz.empty")}
          >
            {(data) => (
              <>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <KpiCard label={t("cmp.biz.kpi.active")} value={String(data.summary.active_campaigns)} />
                  <KpiCard
                    label={t("cmp.biz.kpi.participants")}
                    value={String(data.summary.total_participants)}
                  />
                  <KpiCard label={t("cmp.biz.kpi.issued")} value={String(data.summary.rewards_issued)} />
                  <KpiCard
                    label={t("cmp.biz.kpi.redeemed")}
                    value={String(data.summary.rewards_redeemed)}
                  />
                </div>

                <div className="mt-6 overflow-x-auto rounded-[18px] border border-line bg-card">
                  <div className="min-w-[640px]">
                    <div
                      className={`${TABLE_COLS} border-b border-line px-[22px] py-3.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-subtle`}
                    >
                      <span>{t("cmp.biz.col.campaign")}</span>
                      <span>{t("cmp.biz.col.status")}</span>
                      <span>{t("cmp.biz.col.participants")}</span>
                      <span>{t("cmp.biz.col.completed")}</span>
                      <span>{t("cmp.biz.col.redeemed")}</span>
                      <span>{t("cmp.biz.col.ends")}</span>
                    </div>
                    {data.campaigns.map((row) => (
                      <CampaignRow key={row.id} row={row} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </QueryBoundary>
        </div>
    </OwnerShell>
  );
}
