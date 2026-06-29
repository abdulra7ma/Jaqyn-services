"use client";

import { useCampaignFeed, useCampaignWallet, useMe } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { CustomerShell } from "./_components/CustomerShell";
import { GuestLanding } from "./_components/GuestLanding";
import { MyQrButton } from "./_components/QrSheet";
import { CampaignCard, VoucherCard } from "./_components/campaigns";
import { GiftIcon } from "./_components/icons";
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

function AuthedHome() {
  const t = useT();
  const me = useMe();
  // Rewards = earned vouchers (the campaign wallet); the feed surfaces in-progress
  // campaigns to keep going (campaigns-restructure design §6 / §6a Change 3).
  const wallet = useCampaignWallet();
  const feed = useCampaignFeed();
  const active = wallet.data?.active ?? [];
  const inProgress = feed.data?.followed ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* header: greeting + Nearby shortcut + personal QR */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-subtle">{t("home.greeting")} 👋</p>
          <p className="truncate font-display text-2xl font-bold tracking-tight text-ink">
            {me.data?.user.name || ""}
          </p>
        </div>
        <div className="flex flex-none gap-2">
          <Link
            href="/rewards"
            aria-label={t("nav.rewards")}
            className="rounded-xl border border-line bg-card p-2.5 text-brand"
          >
            <GiftIcon className="h-5 w-5" />
          </Link>
          <Link
            href="/nearby"
            className="rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-ink"
          >
            {t("nav.nearby")}
          </Link>
          <MyQrButton className="rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-ink">
            {t("home.myQr")}
          </MyQrButton>
        </div>
      </div>

      {/* Campaigns entry — things to join */}
      <Link
        href="/campaigns"
        className="relative flex items-center gap-3.5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#3C2E22] to-[#5A4330] p-4 text-cream shadow-card"
      >
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5" />
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-white/10 text-xl">
          🎯
        </div>
        <div className="flex-1">
          <p className="font-display font-bold">{t("nav.campaigns")}</p>
          <p className="text-xs text-cream/80">{t("cmp.discover.subtitle")}</p>
        </div>
        <span aria-hidden className="text-cream/70">
          ›
        </span>
      </Link>

      {/* earned rewards (active vouchers) */}
      {active.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display font-bold text-ink">{t("nav.rewards")}</h2>
            <Link href="/rewards" className="text-sm font-semibold text-brand">
              {t("home.viewAll")}
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {active.slice(0, 3).map((v) => (
              <VoucherCard key={v.id} voucher={v} />
            ))}
          </div>
        </section>
      )}

      {/* keep-going: in-progress campaigns from places you go */}
      {inProgress.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display font-bold text-ink">{t("cmp.feed.followed")}</h2>
            <Link href="/campaigns" className="text-sm font-semibold text-brand">
              {t("home.viewAll")}
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {inProgress.slice(0, 3).map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
