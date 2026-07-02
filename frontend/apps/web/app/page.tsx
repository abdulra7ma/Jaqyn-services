"use client";

import {
  useCampaignFeed,
  useCampaignWallet,
  useLoyaltyCards,
  useLoyaltyVouchers,
  useMe,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { CustomerShell } from "./_components/CustomerShell";
import { GuestLanding } from "./_components/GuestLanding";
import {
  dedupeBusinesses,
  DiscoverRail,
  ExpiringStrip,
  HeroCard,
  HeroSkeleton,
  RailSkeleton,
  WalletPeekRail,
} from "./_components/home";
import { pickHero } from "./_lib/pickHero";
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
  const wallet = useCampaignWallet();
  const feed = useCampaignFeed();
  const loyaltyCards = useLoyaltyCards();
  const loyaltyVouchers = useLoyaltyVouchers();

  const isLoading =
    wallet.isLoading || feed.isLoading || loyaltyCards.isLoading || loyaltyVouchers.isLoading;

  const campaignVouchers = wallet.data?.active ?? [];
  const loyaltyVoucherList = loyaltyVouchers.data?.active ?? [];
  const cards = loyaltyCards.data ?? [];
  const followed = feed.data?.followed ?? [];
  const discover = feed.data?.discover ?? [];

  const hero = pickHero({ campaignVouchers, loyaltyVouchers: loyaltyVoucherList, loyaltyCards: cards, followed });

  // The campaign voucher shown in the hero (if any) is excluded from the expiring strip.
  const heroVoucherId =
    hero.kind === "voucher" && hero.source === "campaign"
      ? campaignVouchers.find((v) => v.expiring_soon)?.id
      : undefined;

  // Avatar initials from user name.
  const name = me.data?.user.name ?? "";
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const businesses = dedupeBusinesses(discover);

  return (
    <div className="flex flex-col gap-5">
      {/* ── 1. Header: greeting + avatar link ───────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-subtle">{t("home.greeting")} 👋</p>
          <p className="truncate font-display text-2xl font-bold tracking-tight text-ink">
            {name}
          </p>
        </div>
        <Link
          href="/profile"
          aria-label="profile"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-tile font-display text-base font-bold text-brand"
        >
          {initials || "?"}
        </Link>
      </div>

      {/* ── 2. Hero card ─────────────────────────────────────────────────── */}
      {isLoading ? <HeroSkeleton /> : <HeroCard hero={hero} />}

      {/* ── 3. Wallet peek rail ──────────────────────────────────────────── */}
      {isLoading ? (
        cards.length > 0 && <RailSkeleton />
      ) : (
        <WalletPeekRail cards={cards} />
      )}

      {/* ── 4. Expiring-soon strip (campaign vouchers) ───────────────────── */}
      {!isLoading && (
        <ExpiringStrip vouchers={campaignVouchers} heroVoucherId={heroVoucherId} />
      )}

      {/* ── 5. Discover rail ─────────────────────────────────────────────── */}
      {isLoading ? <RailSkeleton /> : <DiscoverRail businesses={businesses} />}

      {/* ── 6. Compact campaigns row ─────────────────────────────────────── */}
      <Link
        href="/campaigns"
        className="flex items-center gap-3.5 rounded-2xl border border-line bg-card p-4 shadow-card"
        aria-label={t("home.campaigns")}
      >
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-tile text-lg">
          🎯
        </div>
        <span className="flex-1 font-semibold text-ink">{t("home.campaigns")}</span>
        <span aria-hidden className="text-subtle">
          ›
        </span>
      </Link>
    </div>
  );
}
