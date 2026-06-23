"use client";

import { useMe, useRewards, type RewardProgress } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { CustomerShell } from "./_components/CustomerShell";
import { GuestLanding } from "./_components/GuestLanding";
import { QueryBoundary } from "./_components/QueryBoundary";
import { RewardCard } from "./_components/cards";
import { useAuth } from "./_lib/auth";

export default function HomePage() {
  const t = useT();
  const { isAuthenticated, ready } = useAuth();

  if (!ready) return null;
  // Signed-out visitors get the full responsive discovery landing (no bottom nav).
  if (!isAuthenticated) return <GuestLanding />;
  // Signed-in customers get the app shell (bottom nav is mobile-only).
  return (
    <CustomerShell title={t("app.customer")}>
      <AuthedHome />
    </CustomerShell>
  );
}

function pickClosest(list: RewardProgress[]): RewardProgress | null {
  const active = list.filter((p) => p.status === "active" && (p.target_count ?? 0) > 0);
  if (!active.length) return list.find((p) => p.status === "unlocked") ?? null;
  return active.sort(
    (a, b) => b.current_count / (b.target_count ?? 1) - a.current_count / (a.target_count ?? 1),
  )[0]!;
}

function AuthedHome() {
  const t = useT();
  const me = useMe();
  const rewards = useRewards();
  const closest = rewards.data ? pickClosest(rewards.data) : null;
  const target = closest?.target_count ?? closest?.reward_program.required_count ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-subtle">{t("home.greeting")} 👋</p>
          <p className="font-display text-2xl font-bold tracking-tight text-ink">
            {me.data?.user.name || ""}
          </p>
        </div>
        <Link
          href="/qr"
          className="rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-ink"
        >
          {t("home.myQr")}
        </Link>
      </div>

      {/* closest reward hero */}
      {closest && (
        <Link
          href={`/rewards/${closest.id}`}
          className="relative overflow-hidden rounded-3xl bg-brand-gradient p-6 text-brand-fg shadow-glow"
        >
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
          <p className="text-xs font-bold uppercase tracking-wider opacity-85">{t("home.closest")}</p>
          <p className="mt-2 font-display text-xl font-bold leading-tight">
            {closest.status === "unlocked"
              ? closest.reward_program.reward_description
              : `${Math.max(1, target - closest.current_count)} ${t("home.stamps")} → ${closest.reward_program.reward_description}`}
            {closest.business.name ? ` ${t("home.at")} ${closest.business.name}` : ""}
          </p>
          {target > 0 && (
            <>
              <div className="mt-4 h-2 overflow-hidden rounded-pill bg-white/25">
                <div
                  className="h-full rounded-pill bg-white transition-all"
                  style={{ width: `${Math.min(100, (closest.current_count / target) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm opacity-90">
                {closest.status === "unlocked"
                  ? `🎉 ${t("rewards.status.unlocked")}`
                  : `${closest.current_count}/${target} ${t("home.stamps")}`}
              </p>
            </>
          )}
        </Link>
      )}

      {/* group deals entry card */}
      <Link
        href="/group-offers"
        className="relative flex items-center gap-3.5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#3C2E22] to-[#5A4330] p-4 text-cream shadow-card"
      >
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-white/10 text-xl">👥</div>
        <div className="flex-1">
          <p className="font-display font-bold">{t("home.groupDeals")}</p>
          <p className="text-xs text-cream/80">{t("home.groupDealsSub")}</p>
        </div>
        <span aria-hidden className="text-cream/70">›</span>
      </Link>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display font-bold text-ink">{t("home.activeRewards")}</h2>
          <Link href="/rewards" className="text-sm font-semibold text-brand">{t("home.viewAll")}</Link>
        </div>
        <QueryBoundary query={rewards} isEmpty={(r) => r.length === 0} emptyMessage={t("rewards.empty")}>
          {(list) => (
            <div className="flex flex-col gap-3">
              {list.slice(0, 3).map((p) => (
                <RewardCard key={p.id} progress={p} />
              ))}
            </div>
          )}
        </QueryBoundary>
      </section>
    </div>
  );
}
