"use client";

import {
  useWallet,
  type WalletReward,
  type RewardProgress,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { InitialTile, StampRow } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";

// ── helpers ─────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── sub-components ────────────────────────────────────────────────────────────

function AvailableCard({ item }: { item: WalletReward }) {
  const t = useT();
  // Use the first redemption id so the "Use" button links to the present flow
  const firstId = item.redemption_ids[0];
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <InitialTile name={item.business.name} size={44} image={item.business.logo_url} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/rewards/business/${item.business.id}`}
            className="truncate font-bold text-ink hover:text-brand"
          >
            {item.business.name}
          </Link>
          <p className="truncate text-xs text-subtle">{item.reward.title}</p>
        </div>
        {/* count badge */}
        {item.count > 1 && (
          <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-brand px-2 text-xs font-bold text-brand-fg">
            ×{item.count}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm font-semibold text-brand">🎁 {item.reward.description}</p>

      {item.soonest_expiry && (
        <p className="mt-1 text-xs text-subtle">
          {t("rewards.useBy")} {fmt(item.soonest_expiry)}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <Link
          href={`/rewards/business/${item.business.id}`}
          className="text-xs font-semibold text-brand hover:underline"
        >
          {item.business.name} ›
        </Link>
        {firstId && (
          <Link
            href={`/rewards/present/${firstId}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-brand-gradient px-4 text-xs font-bold text-brand-fg shadow-glow transition active:scale-[.99]"
          >
            {t("rewards.use")}
          </Link>
        )}
      </div>
    </div>
  );
}

function InProgressCard({ progress }: { progress: RewardProgress }) {
  const prog = progress.reward_program;
  const target = progress.target_count ?? prog.required_count ?? 0;
  const label = progress.business.name || prog.title;

  return (
    <Link
      href={`/rewards/business/${progress.business.id}`}
      className="block rounded-2xl border border-line bg-card p-4 shadow-card transition active:scale-[.99]"
    >
      <div className="flex items-center gap-3">
        <InitialTile name={label} size={44} image={progress.business.logo_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink">{label}</p>
          <p className="truncate text-xs text-subtle">{prog.title}</p>
        </div>
      </div>

      {target > 0 && (
        <div className="mt-3">
          <StampRow current={progress.current_count} target={target} />
        </div>
      )}

      <p className="mt-2 text-xs font-semibold text-subtle">
        🎁 {prog.reward_description}
        {progress.current_count > 0 && target > 0
          ? ` · ${progress.current_count}/${target}`
          : ""}
      </p>
    </Link>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function RewardsPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  // Poll so earning a new voucher / using one updates the wallet quickly
  const wallet = useWallet({ refetchInterval: 3000 });

  return (
    <CustomerShell title={t("rewards.title")}>
      {!isAuthenticated ? null : (
        <QueryBoundary
          query={wallet}
          isEmpty={(w) => w.available.length === 0 && w.in_progress.length === 0}
          emptyMessage={t("rewards.empty")}
        >
          {(w) => (
            <div className="flex flex-col gap-6">
              {/* ── Ready to use ── */}
              {w.available.length > 0 && (
                <section>
                  <h2 className="mb-3 font-display text-base font-bold text-ink">
                    {t("rewards.readyToUse")}
                  </h2>
                  <div className="flex flex-col gap-3">
                    {w.available.map((item) => (
                      <AvailableCard key={`${item.business.id}:${item.reward.id}`} item={item} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── In progress ── */}
              {w.in_progress.length > 0 && (
                <section>
                  <h2 className="mb-3 font-display text-base font-bold text-ink">
                    {t("rewards.inProgress")}
                  </h2>
                  <div className="flex flex-col gap-3">
                    {w.in_progress.map((p) => (
                      <InProgressCard key={p.id} progress={p} />
                    ))}
                  </div>
                </section>
              )}

              {/* empty only when both sections are empty (QueryBoundary covers this, but
                  guard just in case one section is empty and the other is not) */}
              {w.available.length === 0 && w.in_progress.length === 0 && (
                <p className="text-center text-sm text-subtle">{t("rewards.empty")}</p>
              )}
            </div>
          )}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}
