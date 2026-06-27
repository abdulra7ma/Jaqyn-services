"use client";

// Business campaigns — list (campaigns-restructure design §5). A Type filter row +
// a Status filter row over the campaign cards; each card shows a type badge, a
// status pill, the three type-specific stats (from type_stats), and the reward.
// Wired to useBusinessCampaigns({type,status}).

import {
  useBusinessCampaigns,
  type BusinessCampaignListParams,
  type BusinessCampaignRow,
  type BusinessCampaignType,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OwnerShell } from "../_components/OwnerShell";
import { KpiCard, StatusPill, TypeBadge, TYPE_GLYPH } from "../_components/campaigns";
import { QueryBoundary } from "../../_components/QueryBoundary";

type TypeFilter = "all" | BusinessCampaignType;
type StatusFilter = NonNullable<BusinessCampaignListParams["status"]> | "all";

const TYPE_FILTERS: TypeFilter[] = ["all", "individual", "group", "social"];
const STATUS_FILTERS: StatusFilter[] = ["all", "active", "draft", "completed"];

function FilterRow<T extends string>({
  options,
  value,
  onChange,
  labelFor,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelFor: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt)}
            className={`rounded-pill px-3.5 py-1.5 text-[13px] font-semibold transition ${
              active ? "bg-brand text-brand-fg" : "border border-line bg-card text-subtle hover:text-ink"
            }`}
          >
            {labelFor(opt)}
          </button>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="font-display text-[20px] font-extrabold leading-none text-ink">{value}</div>
      <div className="mt-1 truncate text-[11.5px] text-subtle">{label}</div>
    </div>
  );
}

function CampaignCard({ row }: { row: BusinessCampaignRow }) {
  const t = useT();
  return (
    <Link
      href={`/business/campaigns/${row.id}`}
      className="block rounded-[18px] border border-line bg-card p-[18px] transition hover:border-brand/40 hover:shadow-glow"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-muted text-xl"
          aria-hidden
        >
          {row.glyph || TYPE_GLYPH[row.type]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-ink">{row.name}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <TypeBadge type={row.type} />
            <StatusPill status={row.status} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[#F4ECDF] pt-4">
        <Stat label={row.type_stats.stat_a.label} value={row.type_stats.stat_a.value} />
        <Stat label={row.type_stats.stat_b.label} value={row.type_stats.stat_b.value} />
        <Stat label={row.type_stats.stat_c.label} value={row.type_stats.stat_c.value} />
      </div>
      {row.reward_title && (
        <div className="mt-3 text-[13px] text-subtle">
          <span className="font-semibold text-ink">{t("cmp.biz.card.reward")}:</span> {row.reward_title}
        </div>
      )}
    </Link>
  );
}

export default function BusinessCampaignsPage() {
  const t = useT();
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const params: BusinessCampaignListParams = {
    ...(typeFilter !== "all" ? { type: typeFilter } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
  };
  const list = useBusinessCampaigns(params);

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

        <div className="mb-4 flex flex-col gap-2.5">
          <FilterRow
            options={TYPE_FILTERS}
            value={typeFilter}
            onChange={setTypeFilter}
            labelFor={(v) => t(`cmp.biz.filter.type.${v}`)}
          />
          <FilterRow
            options={STATUS_FILTERS}
            value={statusFilter}
            onChange={setStatusFilter}
            labelFor={(v) => t(`cmp.biz.filter.status.${v}`)}
          />
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

              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.campaigns.map((row) => (
                  <CampaignCard key={row.id} row={row} />
                ))}
              </div>
            </>
          )}
        </QueryBoundary>
      </div>
    </OwnerShell>
  );
}
