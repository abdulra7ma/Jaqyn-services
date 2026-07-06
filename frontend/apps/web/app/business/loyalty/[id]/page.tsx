"use client";

import {
  useActivateLoyaltyProgram,
  useArchiveLoyaltyProgram,
  useLoyaltyProgramDetail,
  usePauseLoyaltyProgram,
  useUpdateLoyaltyProgram,
  type BusinessLoyaltyProgramDetail,
  type LoyaltyProgramInput,
  type LoyaltyType,
} from "@jaqyn/api";
import { useI18n, useT } from "@jaqyn/i18n";
import { Badge } from "@jaqyn/ui";
import { useParams, useRouter } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { QueryBoundary } from "../../../_components/QueryBoundary";
import { OwnerShell } from "../../_components/OwnerShell";
import { LOYALTY_TYPE_GLYPH } from "../../_components/loyalty";
import {
  DEFAULT_TIER_DRAFTS,
  draftsToTiers,
  TierEditor,
  tiersToDrafts,
} from "../../_components/TierEditor";

type Tab = "overview" | "members" | "transactions" | "rewardUsage" | "analytics" | "settings";

const TABS: Tab[] = ["overview", "members", "transactions", "rewardUsage", "analytics", "settings"];
const PANEL = "rounded-[18px] border border-line bg-card p-5";

const TXN_TONE: Record<string, "ok" | "warn" | "neutral" | "danger"> = {
  earn: "ok",
  redeem: "neutral",
  adjust: "warn",
  reverse: "danger",
};

const VOUCHER_TONE: Record<string, "ok" | "warn" | "neutral" | "danger"> = {
  active: "ok",
  redeemed: "neutral",
  expired: "warn",
  cancelled: "danger",
};

export default function LoyaltyProgramDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const detail = useLoyaltyProgramDetail(id);

  return (
    <OwnerShell title={t("owner.nav.loyalty")}>
      <QueryBoundary query={detail}>{(d) => <Detail id={id} program={d} />}</QueryBoundary>
    </OwnerShell>
  );
}

function Detail({ id, program: p }: { id: string; program: BusinessLoyaltyProgramDetail }) {
  const t = useT();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");

  const pause = usePauseLoyaltyProgram();
  const activate = useActivateLoyaltyProgram();
  const archive = useArchiveLoyaltyProgram();
  const busy = pause.isPending || activate.isPending || archive.isPending;

  const a = p.analytics;

  return (
    <div className="max-w-[920px] animate-[jqIn_.3s_ease]">
      <button
        onClick={() => router.push("/business/loyalty")}
        className="mb-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-subtle"
      >
        {t("loyalty.biz.back")}
      </button>

      {/* solid terracotta hero */}
      <div className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-[20px] bg-brand p-6 text-white">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden />
        <div
          className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-white/15 text-3xl"
          aria-hidden
        >
          {LOYALTY_TYPE_GLYPH[p.type]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-pill bg-white/15 px-2.5 py-1 text-[11.5px] font-bold">
              {t(`loyalty.biz.${p.type}`)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/15 px-2.5 py-1 text-[11.5px] font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
              {t(`loyalty.biz.status.${p.status}`)}
            </span>
          </div>
          <h1 className="mt-1.5 font-display text-[24px] font-bold leading-tight">{p.name}</h1>
          <p className="mt-1 text-[13px] text-white/80">
            {a.members} {t("loyalty.biz.members")} · {a.outstanding} {t("loyalty.biz.outstanding")} · {a.redeemed}{" "}
            {t("loyalty.biz.redeemed")}
          </p>
        </div>
        <div className="flex flex-none gap-2.5">
          {p.status === "active" && (
            <button
              onClick={() => pause.mutate(id)}
              disabled={busy}
              className="rounded-xl bg-white px-4 py-2.5 text-[13px] font-bold text-ink transition active:scale-[.99] disabled:opacity-60"
            >
              {t("loyalty.biz.pause")}
            </button>
          )}
          {/* paused → activate, archived → restore (both reactivate the program) */}
          {p.status !== "active" && (
            <button
              onClick={() => activate.mutate(id)}
              disabled={busy}
              className="rounded-xl bg-white px-4 py-2.5 text-[13px] font-bold text-brand transition active:scale-[.99] disabled:opacity-60"
            >
              {t(p.status === "archived" ? "loyalty.biz.set.restore" : "loyalty.biz.activate")}
            </button>
          )}
          {p.status !== "archived" && (
            <button
              onClick={() => archive.mutate(id)}
              disabled={busy}
              className="rounded-xl border-[1.5px] border-white/50 px-4 py-2.5 text-[13px] font-bold text-white transition active:scale-[.99] disabled:opacity-60"
            >
              {t("loyalty.biz.archive")}
            </button>
          )}
        </div>
      </div>

      {/* tab bar */}
      <div className="mt-[22px] flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            aria-current={tab === tb}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[13.5px] font-semibold transition ${
              tab === tb ? "border-brand text-ink" : "border-transparent text-subtle hover:text-ink"
            }`}
          >
            {t(`loyalty.biz.tab.${tb}`)}
          </button>
        ))}
      </div>

      <div className="mt-[22px]">
        {tab === "overview" && <OverviewTab p={p} />}
        {tab === "members" && <MembersTab p={p} />}
        {tab === "transactions" && <TransactionsTab p={p} />}
        {tab === "rewardUsage" && <RewardUsageTab p={p} />}
        {tab === "analytics" && <AnalyticsTab p={p} />}
        {tab === "settings" && <SettingsTab p={p} />}
      </div>
    </div>
  );
}

// ---- shared ------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-line bg-card p-[18px]">
      <div className="font-display text-[26px] font-extrabold leading-none text-ink">{value}</div>
      <div className="mt-2 text-[12.5px] text-subtle">{label}</div>
    </div>
  );
}

function fmtDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(d);
}

function fmtDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function avg(members: BusinessLoyaltyProgramDetail["members"], key: string): number {
  if (members.length === 0) return 0;
  const total = members.reduce((s, m) => s + (m.state[key] ?? 0), 0);
  return total / members.length;
}

function redemptionRate(p: BusinessLoyaltyProgramDetail): number {
  const { redeemed, outstanding } = p.analytics;
  const denom = redeemed + outstanding || 1;
  return Math.round((redeemed / denom) * 100);
}

// ---- Overview ---------------------------------------------------------------

function OverviewTab({ p }: { p: BusinessLoyaltyProgramDetail }) {
  const t = useT();
  const a = p.analytics;
  const outstandingLabel = p.type === "points" ? t("loyalty.biz.ov.pointsBalance") : t("loyalty.biz.ov.outstanding");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t("loyalty.biz.ov.members")} value={String(a.members)} />
        <StatCard label={outstandingLabel} value={String(a.outstanding)} />
        <StatCard label={t("loyalty.biz.ov.redeemed")} value={String(a.redeemed)} />
        <StatCard label={t("loyalty.biz.ov.redemptionRate")} value={`${redemptionRate(p)}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LoyaltyMeter p={p} />
        <RewardCard p={p} />
      </div>

      <TierLadderCard p={p} />
    </div>
  );
}

/**
 * Owner view of the cashback status ladder: each rung with its threshold and
 * rate, plus how many members currently hold that status (derived from the
 * members' lifetime visit counts). Hidden when the program has no ladder.
 */
function TierLadderCard({ p }: { p: BusinessLoyaltyProgramDetail }) {
  const t = useT();
  const tiers = p.tiers ?? [];
  if (tiers.length === 0) return null;

  const memberCounts = tiers.map((tier, i) => {
    const next = tiers[i + 1];
    return (p.members ?? []).filter((m) => {
      const visits = m.state.visits_count ?? 0;
      return visits >= tier.min_visits && (next == null || visits < next.min_visits);
    }).length;
  });

  return (
    <div className={PANEL}>
      <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-subtle">
        {t("loyalty.biz.tiers.ladder")}
      </div>
      <div className="mt-4 flex flex-col gap-2.5">
        {tiers.map((tier, i) => (
          <div key={tier.name} className="flex items-center gap-3 rounded-xl bg-cream/60 px-3.5 py-3">
            <span
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-muted font-display text-[13px] font-bold text-brand"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold text-ink">{tier.name}</div>
              <div className="text-[12px] text-subtle">
                {tier.min_visits === 0
                  ? t("loyalty.tiers.fromStart")
                  : t("loyalty.tiers.fromVisits").replace("{count}", String(tier.min_visits))}
              </div>
            </div>
            <span className="flex-none text-[12px] font-semibold text-subtle">
              {t("loyalty.biz.tiers.membersAt").replace("{count}", String(memberCounts[i]))}
            </span>
            <span className="flex-none rounded-pill bg-brand-muted px-3 py-1 text-[12.5px] font-bold text-brand">
              {Number(tier.cashback_percent)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoyaltyMeter({ p }: { p: BusinessLoyaltyProgramDetail }) {
  const t = useT();
  const goal = p.required_count ?? 0;

  const heading =
    p.type === "points" ? t("loyalty.biz.meter.points") : p.type === "stamp" ? t("loyalty.biz.meter.stamp") : t("loyalty.biz.meter.visit");

  if (p.type === "points") {
    const balance = Math.round(avg(p.members, "points_balance"));
    const min = p.min_redeem_points ?? 0;
    const pct = min > 0 ? Math.min(100, Math.round((balance / min) * 100)) : 0;
    return (
      <MeterShell heading={heading}>
        <div className="mt-4 flex items-end gap-2">
          <span className="font-display text-[34px] font-extrabold leading-none text-ink">{balance}</span>
          <span className="pb-1 text-[12.5px] text-subtle">{t("loyalty.biz.meter.ptsUnit")} {t("loyalty.biz.meter.average")}</span>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-pill bg-[#F4ECDF]">
          <div
            className="h-full origin-left rounded-pill bg-brand-gradient animate-[jqGrowX_.9s_ease-out]"
            style={{ width: `${pct}%` }}
          />
        </div>
        {min > 0 && (
          <p className="mt-2 text-[12px] text-subtle">
            {pct}% {t("loyalty.biz.meter.toRedeem")} ({min} {t("loyalty.biz.pts")})
          </p>
        )}
      </MeterShell>
    );
  }

  const collected = avg(p.members, p.type === "stamp" ? "stamps_count" : "visits_count");
  const filled = Math.round(collected);

  if (p.type === "visit") {
    const pct = goal ? Math.min(100, (collected / goal) * 100) : 0;
    const C = 2 * Math.PI * 39.5; // circumference of the r=39.5 ring
    const offset = C * (1 - pct / 100);
    return (
      <MeterShell heading={heading}>
        <div className="mt-4 flex items-center gap-4">
          <div className="relative h-[88px] w-[88px] flex-none">
            <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90" aria-hidden>
              <circle cx="44" cy="44" r="39.5" fill="none" strokeWidth="9" className="stroke-[#F4ECDF]" />
              <circle
                cx="44"
                cy="44"
                r="39.5"
                fill="none"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={offset}
                className="stroke-brand animate-[jqRingFill_1s_ease-out]"
                style={{ ["--c" as string]: `${C}` } as CSSProperties}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-display text-[16px] font-extrabold text-ink">
              {filled}/{goal}
            </span>
          </div>
          <p className="text-[13px] text-subtle">
            {filled} / {goal} {t("loyalty.biz.meter.average")}
          </p>
        </div>
      </MeterShell>
    );
  }

  // stamp grid
  return (
    <MeterShell heading={heading}>
      <div className="mt-4 flex flex-wrap gap-2">
        {Array.from({ length: goal }, (_, i) => {
          const on = i < filled;
          return (
            <div
              key={i}
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${
                on ? "bg-brand text-white animate-[jqPop_.45s_ease-out_both]" : "border-[1.5px] border-dashed border-[#D8C8B0] bg-[#F4ECDF]"
              }`}
              style={on ? { animationDelay: `${i * 70}ms` } : undefined}
              aria-label={`Stamp ${i + 1}`}
            >
              {on ? "★" : ""}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12.5px] text-subtle">
        {filled} / {goal} {t("loyalty.biz.meter.average")}
      </p>
    </MeterShell>
  );
}

function MeterShell({ heading, children }: { heading: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className={PANEL}>
      <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-subtle">{t("loyalty.biz.meter.title")}</div>
      <h3 className="mt-1 font-display text-[15px] font-bold text-ink">{heading}</h3>
      {children}
    </div>
  );
}

function RewardCard({ p }: { p: BusinessLoyaltyProgramDetail }) {
  const t = useT();
  const sub = p.type === "points" ? t("loyalty.biz.reward.subPoints") : t("loyalty.biz.reward.subVoucher");
  const limit =
    p.type === "points"
      ? `${t("loyalty.biz.reward.min")} ${p.min_redeem_points ?? 0} ${t("loyalty.biz.pts")}`
      : t("loyalty.biz.reward.activeReward");

  return (
    <div className={`${PANEL} bg-cream/40`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-subtle">{t("loyalty.biz.overview.reward")}</div>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl bg-card text-xl" aria-hidden>
          🎁
        </div>
        <div className="font-display text-[16px] font-bold text-ink">{p.reward_title || p.reward_summary}</div>
      </div>
      <p className="mt-3 text-[13px] leading-snug text-subtle">{sub}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {p.type !== "points" && (
          <span className="rounded-pill border border-line bg-card px-3 py-1 text-[12px] font-semibold text-ink">
            ⏳ {t("loyalty.biz.reward.valid")} {p.reward_expiry_days ?? 30} {t("loyalty.biz.reward.days")}
          </span>
        )}
        <span className="rounded-pill border border-line bg-card px-3 py-1 text-[12px] font-semibold text-ink">{limit}</span>
      </div>
    </div>
  );
}

// ---- Members ----------------------------------------------------------------

function monthsAgo(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  const days = (Date.now() - then) / 86_400_000;
  return Math.max(0, Math.floor(days / 30));
}

function MembersTab({ p }: { p: BusinessLoyaltyProgramDetail }) {
  const t = useT();
  const members = p.members ?? [];
  if (members.length === 0)
    return <p className="text-[13.5px] text-subtle">{t("loyalty.biz.members.empty")}</p>;

  const goal = p.required_count ?? 0;
  const progressKey = p.type === "points" ? "points_balance" : p.type === "stamp" ? "stamps_count" : "visits_count";
  const unit =
    p.type === "points" ? t("loyalty.biz.pts") : p.type === "stamp" ? t("loyalty.biz.members.col.progress") : t("loyalty.biz.tab.members");

  return (
    <div className="overflow-x-auto rounded-[18px] border border-line bg-card">
      <div className="min-w-[520px]">
        <div className="grid grid-cols-[2fr_1.2fr_1fr] border-b border-line px-[22px] py-3.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-subtle">
          <span>{t("loyalty.biz.members.col.member")}</span>
          <span>{t("loyalty.biz.members.col.progress")}</span>
          <span className="text-right">{t("loyalty.biz.members.col.status")}</span>
        </div>
        {members.map((m, i) => {
          const count = m.state[progressKey] ?? 0;
          const ready = p.type !== "points" && goal > 0 && count >= goal;
          const mo = monthsAgo(m.joined_at);
          return (
            <div
              key={i}
              className="grid grid-cols-[2fr_1.2fr_1fr] items-center border-b border-[#F4ECDF] px-[22px] py-4 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#F4ECDF] font-display text-[13px] font-bold text-brand">
                  {m.customer_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{m.customer_name}</div>
                  <div className="text-[11.5px] text-subtle">
                    {mo} {t("loyalty.biz.members.moMember")}
                  </div>
                </div>
              </div>
              <span className="text-[13px] text-subtle">
                {p.type === "points" ? `${count} ${unit}` : `${count} / ${goal}`}
              </span>
              <span className="flex justify-end">
                <Badge tone={ready ? "ok" : "neutral"}>
                  {ready ? t("loyalty.biz.members.rewardReady") : t("loyalty.biz.members.collecting")}
                </Badge>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Transactions ------------------------------------------------------------

function TransactionsTab({ p }: { p: BusinessLoyaltyProgramDetail }) {
  const t = useT();
  const { locale } = useI18n();
  const txns = p.transactions ?? [];
  if (txns.length === 0)
    return <p className="text-[13.5px] text-subtle">{t("loyalty.biz.txn.empty")}</p>;

  return (
    <div className="overflow-x-auto rounded-[18px] border border-line bg-card">
      <div className="min-w-[540px]">
        <div className="grid grid-cols-[1fr_1.4fr_1fr_1fr] border-b border-line px-[22px] py-3.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-subtle">
          <span>{t("loyalty.biz.txn.col.kind")}</span>
          <span>{t("loyalty.biz.txn.col.member")}</span>
          <span>{t("loyalty.biz.txn.col.amount")}</span>
          <span className="text-right">{t("loyalty.biz.txn.col.date")}</span>
        </div>
        {txns.map((txn) => {
          const delta = txn.points_delta ?? txn.stamps_delta ?? 0;
          const unit = txn.points_delta != null ? t("loyalty.biz.pts") : t("loyalty.biz.txn.stamp");
          const positive = delta > 0;
          return (
            <div
              key={txn.id}
              className="grid grid-cols-[1fr_1.4fr_1fr_1fr] items-center border-b border-[#F4ECDF] px-[22px] py-4 last:border-0"
            >
              <span>
                <Badge tone={TXN_TONE[txn.kind] ?? "neutral"}>{t(`loyalty.biz.txn.${txn.kind}`)}</Badge>
              </span>
              <span className="truncate text-[13px] font-semibold text-ink">{txn.customer_name ?? "—"}</span>
              <span className={`text-[13px] font-semibold ${positive ? "text-sage" : "text-danger"}`}>
                {positive ? "+" : ""}
                {delta} {unit}
              </span>
              <span className="text-right text-[13px] text-subtle">{fmtDateTime(txn.created_at, locale)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Reward Usage -----------------------------------------------------------

function RewardUsageTab({ p }: { p: BusinessLoyaltyProgramDetail }) {
  const t = useT();
  const { locale } = useI18n();
  const vouchers = p.vouchers ?? [];
  if (vouchers.length === 0)
    return <p className="text-[13.5px] text-subtle">{t("loyalty.biz.voucher.empty")}</p>;

  return (
    <div className="overflow-x-auto rounded-[18px] border border-line bg-card">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[1fr_1.4fr_1fr_1fr] border-b border-line px-[22px] py-3.5 text-[11.5px] font-bold uppercase tracking-[0.04em] text-subtle">
          <span>{t("loyalty.biz.voucher.col.code")}</span>
          <span>{t("loyalty.biz.voucher.col.customer")}</span>
          <span>{t("loyalty.biz.voucher.col.issued")}</span>
          <span className="text-right">{t("loyalty.biz.voucher.col.status")}</span>
        </div>
        {vouchers.map((v, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_1.4fr_1fr_1fr] items-center border-b border-[#F4ECDF] px-[22px] py-4 last:border-0"
          >
            <span className="font-mono text-[13px] font-semibold text-ink">{v.voucher_code}</span>
            <span className="truncate text-[13px] text-ink">{v.customer_name}</span>
            <span className="text-[13px] text-subtle">{fmtDate(v.issued_at, locale)}</span>
            <span className="flex justify-end">
              <Badge tone={VOUCHER_TONE[v.status] ?? "neutral"}>{t(`loyalty.biz.voucher.status.${v.status}`)}</Badge>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Analytics --------------------------------------------------------------

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[18px] border border-line bg-card p-[18px]">
      <div className="text-[12.5px] font-semibold text-subtle">{label}</div>
      <div className="mt-2.5 font-display text-[26px] font-extrabold leading-none text-ink">{value}</div>
      {sub && <div className="mt-2 text-[12px] text-subtle">{sub}</div>}
    </div>
  );
}

function RedemptionChart({ data }: { data: number[] }) {
  const t = useT();
  const { locale } = useI18n();
  const max = Math.max(1, ...data);
  const today = new Date();
  const labels = data.map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (data.length - 1 - i));
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d);
  });
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[15px] font-bold text-ink">{t("loyalty.biz.an.chartTitle")}</h3>
        <span className="text-[12px] text-subtle">{t("loyalty.biz.an.chartRange")}</span>
      </div>
      <div className="mt-5 grid grid-cols-7 gap-2">
        {data.map((v, i) => (
          <div key={i} className="flex h-[160px] flex-col items-center justify-end gap-1.5">
            <span className="text-[11px] font-bold text-ink">{v}</span>
            <div
              className="w-full max-w-[28px] origin-bottom rounded-t-md bg-brand animate-[jqGrowY_.6s_ease-out_both]"
              style={{
                height: `${(v / max) * 120}px`,
                minHeight: v > 0 ? 6 : 2,
                opacity: v > 0 ? 1 : 0.25,
                animationDelay: `${i * 55}ms`,
              }}
            />
            <span className="text-[11px] text-subtle">{labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyticsTab({ p }: { p: BusinessLoyaltyProgramDetail }) {
  const t = useT();
  const a = p.analytics;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label={t("loyalty.biz.an.redemptionRate")} value={`${redemptionRate(p)}%`} />
        <Metric label={t("loyalty.biz.an.repeatRate")} value={`${Math.round((a.repeat_rate ?? 0) * 100)}%`} />
        <Metric label={t("loyalty.biz.an.newMembers")} value={`+${a.new_members_30d}`} sub={t("loyalty.biz.an.thisMonth")} />
        <Metric
          label={t("loyalty.biz.an.avgBasket")}
          value={`${Math.round(a.avg_basket ?? 0)} ${t("loyalty.biz.an.basketUnit")}`}
        />
      </div>
      <RedemptionChart data={a.redemptions_7d ?? []} />
    </div>
  );
}

// ---- Settings ---------------------------------------------------------------

const SET_LABEL = "text-[12px] font-bold text-subtle";
const SET_FIELD =
  "mt-1.5 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-brand";

function SettingsTab({ p }: { p: BusinessLoyaltyProgramDetail }) {
  const t = useT();
  const s = p.settings;
  const update = useUpdateLoyaltyProgram(p.id);
  const pause = usePauseLoyaltyProgram();
  const activate = useActivateLoyaltyProgram();
  const archive = useArchiveLoyaltyProgram();
  const lifecycleBusy = pause.isPending || activate.isPending || archive.isPending;

  // Editable draft, seeded from the saved config; PATCH applies to new activity.
  const [name, setName] = useState(s.name ?? "");
  const [rate, setRate] = useState(s.points_per_som ?? s.points_per_visit?.toString() ?? "");
  const [cashback, setCashback] = useState(s.cashback_per_point ?? "");
  const [minimum, setMinimum] = useState(String(s.min_redeem_points ?? ""));
  const [target, setTarget] = useState(String(s.required_count ?? ""));
  const [maxBanked, setMaxBanked] = useState(String(s.max_banked ?? ""));
  const [reward, setReward] = useState(s.reward_title ?? "");
  const [expiry, setExpiry] = useState(String(s.reward_expiry_days ?? ""));
  // Status ladder draft — spend-basis points programs only (backend rule).
  const ladderApplies = s.type === "points" && s.points_basis === "spend";
  const [tiersEnabled, setTiersEnabled] = useState((s.tiers ?? []).length > 0);
  const [tierRows, setTierRows] = useState(() =>
    s.tiers?.length ? tiersToDrafts(s.tiers) : DEFAULT_TIER_DRAFTS,
  );
  const ladder = ladderApplies && tiersEnabled ? draftsToTiers(tierRows) : null;
  const tiersInvalid = ladderApplies && tiersEnabled && ladder === null;

  function onSave() {
    if (tiersInvalid) return;
    const payload: Partial<LoyaltyProgramInput> =
      s.type === "points"
        ? {
            name: name.trim(),
            ...(s.points_basis === "visit"
              ? { points_per_visit: Number(rate) }
              : ladder
                ? // Each rung prices its own rate; the ladder replaces the flat rate.
                  { points_per_som: null, tiers: ladder }
                : { points_per_som: rate, tiers: [] }),
            cashback_per_point: cashback,
            min_redeem_points: Number(minimum),
          }
        : {
            name: name.trim(),
            required_count: Number(target),
            ...(s.type === "stamp" ? { max_banked: Number(maxBanked) } : {}),
            reward_title: reward.trim(),
            reward_expiry_days: Number(expiry),
          };
    update.mutate(payload);
  }

  const statusHint =
    s.status === "active"
      ? t("loyalty.biz.set.statusLive")
      : s.status === "paused"
        ? t("loyalty.biz.set.statusPaused")
        : t("loyalty.biz.set.statusArchived");

  return (
    <div className="max-w-[640px]">
      <div className="rounded-[20px] border border-line bg-card p-6">
        <h2 className="font-display text-[17px] font-bold text-ink">{t("loyalty.biz.set.title")}</h2>
        <p className="mt-1 text-[13px] text-subtle">{t("loyalty.biz.set.sub")}</p>

        <div className="mt-5 flex flex-col gap-4">
          <label className="block">
            <span className={SET_LABEL}>{t("loyalty.biz.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={SET_FIELD} />
          </label>

          {s.type === "points" ? (
            <>
              <div className="flex gap-3">
                {!(ladderApplies && tiersEnabled) && (
                  <label className="block flex-1">
                    <span className={SET_LABEL}>
                      {s.points_basis === "visit" ? t("loyalty.biz.mech.ratePerVisit") : t("loyalty.biz.mech.ratePerSom")}
                    </span>
                    <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="numeric" className={SET_FIELD} />
                  </label>
                )}
                <label className="block flex-1">
                  <span className={SET_LABEL}>{t("loyalty.biz.cashbackRate")}</span>
                  <input value={cashback} onChange={(e) => setCashback(e.target.value)} inputMode="numeric" className={SET_FIELD} />
                </label>
              </div>
              <label className="block">
                <span className={SET_LABEL}>{t("loyalty.biz.minimum")}</span>
                <input value={minimum} onChange={(e) => setMinimum(e.target.value)} inputMode="numeric" className={SET_FIELD} />
              </label>
              {ladderApplies && (
                <div className="rounded-2xl border-[1.5px] border-line bg-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-bold text-ink">{t("loyalty.biz.tiers.toggle")}</p>
                      <p className="mt-0.5 text-[12px] text-subtle">{t("loyalty.biz.tiers.toggleSub")}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={tiersEnabled}
                      aria-label={t("loyalty.biz.tiers.toggle")}
                      onClick={() => setTiersEnabled((v) => !v)}
                      className={`relative h-5 w-9 flex-none rounded-pill transition ${tiersEnabled ? "bg-brand" : "bg-handle"}`}
                    >
                      <span
                        className={`absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-all ${tiersEnabled ? "left-[19px]" : "left-[3px]"}`}
                      />
                    </button>
                  </div>
                  {tiersEnabled && (
                    <div className="mt-4">
                      <TierEditor rows={tierRows} onChange={setTierRows} />
                      {tiersInvalid && (
                        <p className="mt-2 text-[12.5px] font-semibold text-danger">{t("loyalty.biz.tiers.invalid")}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex gap-3">
                <label className="block flex-1">
                  <span className={SET_LABEL}>
                    {s.type === "stamp" ? t("loyalty.biz.mech.stampCount") : t("loyalty.biz.mech.visitCount")}
                  </span>
                  <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="numeric" className={SET_FIELD} />
                </label>
                <label className="block flex-1">
                  <span className={SET_LABEL}>{t("loyalty.biz.rewardStep.expiry")}</span>
                  <input value={expiry} onChange={(e) => setExpiry(e.target.value)} inputMode="numeric" className={SET_FIELD} />
                </label>
              </div>
              {s.type === "stamp" && (
                <label className="block">
                  <span className={SET_LABEL}>{t("loyalty.biz.maxBanked")}</span>
                  <input value={maxBanked} onChange={(e) => setMaxBanked(e.target.value)} inputMode="numeric" className={SET_FIELD} />
                </label>
              )}
              <label className="block">
                <span className={SET_LABEL}>{t("loyalty.biz.rewardStep.titleLabel")}</span>
                <input value={reward} onChange={(e) => setReward(e.target.value)} className={SET_FIELD} />
              </label>
            </>
          )}
        </div>

        {/* status + archive controls */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#F4ECDF] pt-5">
          <div>
            <div className="text-[13.5px] font-bold text-ink">{t("loyalty.biz.set.statusLabel")}</div>
            <div className="text-[12.5px] text-subtle">{statusHint}</div>
          </div>
          {s.status === "active" ? (
            <button
              onClick={() => pause.mutate(p.id)}
              disabled={lifecycleBusy}
              className="rounded-xl border-[1.5px] border-line bg-card px-4 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-60"
            >
              {t("loyalty.biz.pause")}
            </button>
          ) : (
            <button
              onClick={() => activate.mutate(p.id)}
              disabled={lifecycleBusy}
              className="rounded-xl border-[1.5px] border-line bg-card px-4 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-60"
            >
              {t(s.status === "archived" ? "loyalty.biz.set.restore" : "loyalty.biz.activate")}
            </button>
          )}
        </div>

        {s.status !== "archived" && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[13.5px] font-bold text-danger">{t("loyalty.biz.set.archiveLabel")}</div>
              <div className="text-[12.5px] text-subtle">{t("loyalty.biz.set.archiveSub")}</div>
            </div>
            <button
              onClick={() => archive.mutate(p.id)}
              disabled={lifecycleBusy}
              className="rounded-xl border-[1.5px] border-danger bg-card px-4 py-2.5 text-[13px] font-semibold text-danger disabled:opacity-60"
            >
              {t("loyalty.biz.archive")}
            </button>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={onSave}
            disabled={update.isPending || tiersInvalid}
            className="rounded-xl bg-brand px-[22px] py-3.5 text-[14.5px] font-bold text-brand-fg shadow-glow transition active:scale-[.99] disabled:opacity-60"
          >
            {update.isPending ? t("loyalty.biz.set.saving") : t("loyalty.biz.set.save")}
          </button>
          {update.isSuccess && !update.isPending && (
            <span className="text-[13px] font-semibold text-sage">✓ {t("loyalty.biz.set.saved")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
