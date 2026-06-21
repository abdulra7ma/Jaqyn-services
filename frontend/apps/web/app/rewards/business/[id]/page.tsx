"use client";

import { useBusinessRewardCard } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CustomerShell } from "../../../_components/CustomerShell";
import { QueryBoundary } from "../../../_components/QueryBoundary";
import { InitialTile, StampRow } from "../../../_components/kit";
import { useRequireAuth } from "../../../_lib/auth";

// ── helpers ─────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function BusinessRewardCardPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useRequireAuth();

  // Poll so redeem + earn updates reflect live
  const card = useBusinessRewardCard(id, { refetchInterval: 3000 });

  return (
    <CustomerShell title={t("rewards.title")} back="/rewards" showNav={false}>
      {!isAuthenticated ? null : (
        <QueryBoundary query={card}>
          {(data) => (
            <div className="flex flex-col gap-6">
              {/* ── Business header ── */}
              <div className="flex items-center gap-3.5">
                <InitialTile name={data.business.name} size={60} variant="gradient" />
                <div className="min-w-0">
                  <p className="truncate font-display text-xl font-bold text-ink">
                    {data.business.name}
                  </p>
                  {data.business.area && (
                    <p className="text-sm text-subtle">{data.business.area}</p>
                  )}
                </div>
              </div>

              {/* ── Program progress cards ── */}
              {data.programs.length > 0 && (
                <section className="flex flex-col gap-3">
                  {data.programs.map((prog) => {
                    const target = prog.target_count ?? 0;
                    const isSpend = prog.type === "spend";
                    const spendRequired = prog.required_spend
                      ? parseFloat(prog.required_spend)
                      : null;
                    const currentSpend = parseFloat(prog.current_spend ?? "0");
                    const spendPct =
                      spendRequired && spendRequired > 0
                        ? Math.min(100, (currentSpend / spendRequired) * 100)
                        : 0;

                    return (
                      <div
                        key={prog.id}
                        className="rounded-2xl border border-line bg-card p-4 shadow-card"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display text-[15px] font-bold text-ink">
                            {prog.title}
                          </p>
                          {prog.bank_full && (
                            <span className="whitespace-nowrap rounded-pill bg-amber/15 px-2.5 py-1 text-[11px] font-bold text-amber-deep">
                              {t("rewards.bankFull")}
                            </span>
                          )}
                        </div>

                        {/* stamp dots */}
                        {!isSpend && target > 0 && (
                          <div className="mt-3">
                            <StampRow current={prog.current_count} target={target} />
                          </div>
                        )}

                        {/* spend bar */}
                        {isSpend && spendRequired !== null && (
                          <div className="mt-3">
                            <div className="mb-1 flex justify-between text-xs text-subtle">
                              <span>{currentSpend.toFixed(0)}</span>
                              <span>{spendRequired.toFixed(0)}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-board">
                              <div
                                className="h-full rounded-full bg-brand transition-all"
                                style={{ width: `${spendPct}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <p className="mt-3 text-sm font-semibold text-brand">
                          🎁 {prog.reward_description}
                        </p>

                        {/* earned N× */}
                        {prog.completed_count > 0 && (
                          <p className="mt-1 text-xs text-subtle">
                            {t("rewards.earnedTimes")} ×{prog.completed_count}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}

              {/* ── Unused gifts ── */}
              {data.available.length > 0 && (
                <section>
                  <h2 className="mb-3 font-display text-base font-bold text-ink">
                    {t("rewards.unused")} (×{data.available.length})
                  </h2>
                  <div className="flex flex-col gap-2">
                    {data.available.map((v) => (
                      <Link
                        key={v.id}
                        href={`/rewards/present/${v.id}`}
                        className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3.5 shadow-card transition active:scale-[.99]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink">{v.reward_title}</p>
                          {v.expires_at && (
                            <p className="text-xs text-subtle">
                              {t("rewards.useBy")} {fmt(v.expires_at)}
                            </p>
                          )}
                        </div>
                        <span className="ml-3 inline-flex min-h-8 items-center rounded-pill bg-brand-gradient px-3 text-xs font-bold text-brand-fg shadow-glow">
                          {t("rewards.use")}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* ── History ── */}
              {data.history.length > 0 && (
                <section>
                  <h2 className="mb-3 font-display text-base font-bold text-ink">
                    {t("rewards.history")}
                  </h2>
                  <div className="flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
                    {data.history.map((h) => {
                      const isRedeemed = h.status === "redeemed";
                      const date = h.redeemed_at ?? h.created_at;
                      return (
                        <div
                          key={h.id}
                          className="flex items-center justify-between bg-card px-4 py-3.5"
                        >
                          <div className="min-w-0">
                            <p
                              className={`truncate text-sm font-semibold ${
                                isRedeemed ? "text-ink" : "text-subtle"
                              }`}
                            >
                              {isRedeemed ? "✓ " : ""}
                              {h.reward_title}
                            </p>
                            {date && (
                              <p className="text-xs text-subtle">{fmt(date)}</p>
                            )}
                          </div>
                          <span
                            className={`ml-3 text-xs font-semibold ${
                              isRedeemed ? "text-brand" : "text-subtle"
                            }`}
                          >
                            {isRedeemed
                              ? t("rewards.status.redeemed")
                              : t("rewards.status.expired")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* empty state when business has no programs or history */}
              {data.programs.length === 0 &&
                data.available.length === 0 &&
                data.history.length === 0 && (
                  <p className="text-center text-sm text-subtle">{t("rewards.empty")}</p>
                )}
            </div>
          )}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}
