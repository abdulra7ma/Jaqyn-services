"use client";

import { useBusinessLoyaltyPrograms, type LoyaltyProgramConfig, type LoyaltyStatus, type LoyaltyType } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { OwnerShell } from "../_components/OwnerShell";
import { LOYALTY_TYPE_GLYPH, LOYALTY_STATUS_BAR, LoyaltyStatusPill, LoyaltyTypeBadge } from "../_components/loyalty";

type TypeFilter = LoyaltyType | "all";
type StatusFilter = LoyaltyStatus | "all";

const TYPE_FILTERS: TypeFilter[] = ["all", "points", "stamp", "visit"];
const STATUS_FILTERS: StatusFilter[] = ["all", "active", "paused", "archived"];

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
    <div className="grid w-full max-w-[440px] grid-cols-4 gap-1 rounded-[14px] bg-[#F1E7D6] p-1" role="group">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt)}
            className={`min-w-0 rounded-[10px] px-3 py-2 text-[13px] font-bold transition ${
              active
                ? "bg-brand text-brand-fg shadow-[0_3px_8px_rgba(161,74,43,.24)]"
                : "text-[#8A7866] hover:bg-white/45 hover:text-ink"
            }`}
          >
            {labelFor(opt)}
          </button>
        );
      })}
    </div>
  );
}

function FilterSelect<T extends string>({
  options,
  value,
  onChange,
  label,
  labelFor,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  labelFor: (v: T) => string;
}) {
  return (
    <label className="relative block">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full appearance-none rounded-xl border border-line bg-card py-2.5 pl-3 pr-9 text-[13px] font-semibold text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {labelFor(opt)}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-subtle">
        ⌄
      </span>
    </label>
  );
}

function Kpi({ glyph, label, value, sub }: { glyph: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[18px] border border-line bg-card p-[18px]">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#F4ECDF] text-lg" aria-hidden>
          {glyph}
        </span>
        <span className="text-[12.5px] font-semibold text-subtle">{label}</span>
      </div>
      <div className="mt-3 font-display text-[28px] font-extrabold leading-none text-ink">{value}</div>
      <div className="mt-2 text-[12px] text-subtle">{sub}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="font-display text-[20px] font-extrabold leading-none text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-subtle">{label}</div>
    </div>
  );
}

function ProgramCard({ row }: { row: LoyaltyProgramConfig }) {
  const t = useT();
  return (
    <Link
      href={`/business/loyalty/${row.id}`}
      className="block overflow-hidden rounded-[18px] border border-line bg-card transition hover:border-brand/40 hover:shadow-glow"
      style={{ borderLeft: `4px solid ${LOYALTY_STATUS_BAR[row.status]}` }}
    >
      <div className="p-[18px]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[#F4ECDF] text-2xl">
            {LOYALTY_TYPE_GLYPH[row.type]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <LoyaltyTypeBadge type={row.type} />
              <LoyaltyStatusPill status={row.status} />
            </div>
            <div className="mt-1.5 truncate font-display text-[16px] font-bold text-ink">{row.name}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-[14px] border border-line bg-cream/40 px-4 py-3">
          <Stat label={t("loyalty.biz.members")} value={row.members ?? 0} />
          <Stat label={t("loyalty.biz.outstanding")} value={row.outstanding ?? 0} />
          <Stat label={t("loyalty.biz.redeemed")} value={row.redeemed ?? 0} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-[18px] py-3">
        <span className="min-w-0 truncate text-[13px] text-subtle">
          {row.reward_summary ? `🎁 ${row.reward_summary}` : " "}
        </span>
        <span className="flex-none text-[13px] font-bold text-brand">{t("loyalty.biz.openProgram")} ›</span>
      </div>
    </Link>
  );
}

export default function BusinessLoyaltyPage() {
  const t = useT();
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const query = useBusinessLoyaltyPrograms();

  return (
    <OwnerShell title={t("owner.nav.loyalty")}>
      <div className="animate-[jqIn_.3s_ease]">
        {/* Header CTA hides when the list is empty — the empty state below owns
            the single, catchy create action (never two identical buttons). */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <p className="text-[13.5px] text-subtle">{t("loyalty.biz.subtitle")}</p>
          {(query.data?.length ?? 0) > 0 && (
            <button
              onClick={() => router.push("/business/loyalty/new")}
              className="flex flex-none items-center gap-2 rounded-xl bg-brand px-[18px] py-3 text-[13.5px] font-bold text-brand-fg shadow-glow transition active:scale-[.99]"
            >
              + {t("loyalty.biz.new")}
            </button>
          )}
        </div>

        <QueryBoundary
          query={query}
          isEmpty={(rows) => rows.length === 0}
          emptyIcon={<span aria-hidden className="text-4xl">🎴</span>}
          emptyTitle={t("loyalty.biz.emptyTitle")}
          emptyMessage={t("loyalty.biz.emptyBody")}
          emptyAction={{
            label: t("loyalty.biz.emptyCta"),
            onClick: () => router.push("/business/loyalty/new"),
          }}
        >
          {(rows) => {
            const filtered = rows.filter(
              (r) =>
                (typeFilter === "all" || r.type === typeFilter) &&
                (statusFilter === "all" || r.status === statusFilter),
            );
            const active = rows.filter((r) => r.status === "active").length;
            const members = rows.reduce((s, r) => s + (r.members ?? 0), 0);
            const outstanding = rows.reduce((s, r) => s + (r.outstanding ?? 0), 0);
            const redeemed = rows.reduce((s, r) => s + (r.redeemed ?? 0), 0);
            return (
              <>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <Kpi
                    glyph="🎴"
                    label={t("loyalty.biz.kpi.active")}
                    value={String(active)}
                    sub={`${t("loyalty.biz.kpi.ofTotal")} ${rows.length} ${t("loyalty.biz.kpi.totalWord")}`}
                  />
                  <Kpi glyph="👥" label={t("loyalty.biz.kpi.members")} value={String(members)} sub={t("loyalty.biz.kpi.membersSub")} />
                  <Kpi glyph="🎁" label={t("loyalty.biz.kpi.outstanding")} value={String(outstanding)} sub={t("loyalty.biz.kpi.outstandingSub")} />
                  <Kpi glyph="✅" label={t("loyalty.biz.kpi.redeemed")} value={String(redeemed)} sub={t("loyalty.biz.kpi.redeemedSub")} />
                </div>

                <div className="my-5 flex flex-wrap items-center gap-3">
                  <div className="block w-full sm:w-auto lg:hidden">
                    <FilterSelect
                      options={TYPE_FILTERS}
                      value={typeFilter}
                      onChange={setTypeFilter}
                      label={t("loyalty.biz.filter.label.type")}
                      labelFor={(v) => (v === "all" ? t("loyalty.biz.all") : t(`loyalty.biz.${v}`))}
                    />
                  </div>
                  <div className="hidden lg:block">
                    <FilterRow
                      options={TYPE_FILTERS}
                      value={typeFilter}
                      onChange={setTypeFilter}
                      labelFor={(v) => (v === "all" ? t("loyalty.biz.all") : t(`loyalty.biz.${v}`))}
                    />
                  </div>
                  <div className="ml-auto w-[180px] flex-none">
                    <FilterSelect
                      options={STATUS_FILTERS}
                      value={statusFilter}
                      onChange={setStatusFilter}
                      label={t("loyalty.biz.filter.label.status")}
                      labelFor={(v) => t(`loyalty.biz.filter.status.${v}`)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((row) => (
                    <ProgramCard key={row.id} row={row} />
                  ))}
                  {filtered.length === 0 && rows.length > 0 && (
                    <p className="col-span-full text-[13.5px] text-subtle">{t("loyalty.biz.empty")}</p>
                  )}
                </div>
              </>
            );
          }}
        </QueryBoundary>
      </div>
    </OwnerShell>
  );
}
