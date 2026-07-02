"use client";

import type { CampaignVoucher, LoyaltyCardView, LoyaltyVoucher } from "@jaqyn/api";
import { useI18n, useT } from "@jaqyn/i18n";
import Link from "next/link";
import { buildWallet, ACCENT_BG } from "../loyalty/_lib/wallet";
import type { HeroResult } from "../_lib/pickHero";

// The API adapter's expires_label is an ISO stopgap ("2026-07-05") — its own
// comment says locale-aware formatting belongs in the component via @jaqyn/i18n.
// Non-ISO labels (already formatted by the backend, e.g. "3 Jul") pass through.
function shortDate(label: string, locale: string): string {
  const ms = /^\d{4}-\d{2}-\d{2}/.test(label) ? Date.parse(label) : NaN;
  if (Number.isNaN(ms)) return label;
  return new Date(ms).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
    day: "numeric",
    month: "short",
  });
}

// ---------------------------------------------------------------------------
// Hero card
// ---------------------------------------------------------------------------

/** The large full-bleed hero card at the top of home. Renders one of three
 * variants based on the pickHero() result: voucher urgency, progress-to-reward,
 * or new-user CTA. */
export function HeroCard({ hero }: { hero: HeroResult }) {
  const t = useT();
  const { locale } = useI18n();

  if (hero.kind === "new-user") {
    return (
      <Link
        href="/scan"
        className="relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-brand-gradient p-5 text-white shadow-glow"
        aria-label={t("home.startEarning")}
      >
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <p className="font-display text-2xl font-extrabold leading-tight tracking-tight">
          {t("home.startEarning")}
        </p>
        <p className="text-sm text-white/80">{t("home.startEarningSub")}</p>
        <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-pill bg-white/20 px-4 py-2 text-sm font-bold">
          {t("home.scanFirst")} ›
        </span>
      </Link>
    );
  }

  if (hero.kind === "voucher") {
    const bgClass = hero.source === "campaign" ? "bg-wallet-amber" : "bg-wallet-terracotta";
    return (
      <Link
        href={hero.href}
        className={`relative flex flex-col gap-2 overflow-hidden rounded-2xl ${bgClass} p-5 text-white shadow-glow`}
        aria-label={`${hero.title} — ${hero.business}`}
      >
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        {/* urgency pill */}
        <span className="inline-flex w-fit items-center rounded-pill bg-white/25 px-3 py-1 text-xs font-bold uppercase tracking-wide">
          {t("home.expiringSoon")} · {shortDate(hero.urgencyLabel, locale)}
        </span>
        <p className="font-display text-xl font-bold leading-snug">{hero.title}</p>
        <p className="text-sm text-white/80">{hero.business}</p>
        <span className="mt-1 self-end text-sm font-semibold text-white/70">
          {t("home.nextReward")} ›
        </span>
      </Link>
    );
  }

  // progress variant
  const pct = hero.total > 0 ? Math.min(100, Math.round((hero.current / hero.total) * 100)) : 0;
  return (
    <Link
      href={hero.href}
      className={`relative flex flex-col gap-3 overflow-hidden rounded-2xl ${hero.accentClass} p-5 text-white shadow-glow`}
      aria-label={`${hero.title} — ${hero.business}`}
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
      <p className="text-sm font-semibold text-white/80">{hero.business}</p>
      <p className="font-display text-xl font-bold leading-snug">{hero.title}</p>
      {/* progress bar — §9 design-system */}
      <div className="h-2.5 w-full overflow-hidden rounded-pill bg-white/20">
        <div
          className="h-full rounded-pill bg-white"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm font-semibold text-white/90">
        {t("home.stepsLeft").replace("{count}", String(hero.remaining))}
      </p>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Hero skeleton
// ---------------------------------------------------------------------------

export function HeroSkeleton() {
  return <div className="h-40 animate-pulse rounded-2xl bg-tile" />;
}

// ---------------------------------------------------------------------------
// Wallet peek rail
// ---------------------------------------------------------------------------

/** Horizontal snap-scroll mini wallet cards. One card per business (via buildWallet). */
export function WalletPeekRail({ cards }: { cards: LoyaltyCardView[] }) {
  const t = useT();
  const shops = buildWallet(cards.filter((c) => c.joined));

  if (shops.length === 0) return null;

  return (
    <section aria-label={t("home.wallet")}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display font-bold text-ink">{t("home.wallet")}</h2>
        <Link href="/loyalty" className="text-sm font-semibold text-brand">
          {t("home.all")}
        </Link>
      </div>
      {/* scrollable list — semantically a list of links, not clickable divs */}
      <ul
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={t("home.wallet")}
      >
        {shops.map((shop) => {
          const program = shop.programs[0];
          const bgClass = ACCENT_BG[shop.accent];
          // Show the primary program's balance/stamps line.
          const balanceLine = program
            ? program.type === "points"
              ? `${program.points_balance} pts`
              : program.type === "stamp"
                ? `${program.stamps_count}/${program.required_count ?? "?"}`
                : `${program.visits_count}/${program.required_count ?? "?"}`
            : "";

          return (
            <li key={shop.businessId} className="flex-none snap-start">
              <Link
                href="/loyalty"
                aria-label={shop.businessName}
                className={`flex w-40 flex-col justify-between gap-6 overflow-hidden rounded-xl ${bgClass} p-3.5 text-white shadow-card`}
              >
                <p className="truncate text-xs font-bold text-white/80">{shop.businessName}</p>
                <p className="font-display text-sm font-bold">{balanceLine}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Expiring-soon strip
// ---------------------------------------------------------------------------

/** Slim horizontal strip of campaign vouchers with expiring_soon.
 * The voucher already shown in the hero is excluded via `heroVoucherId`. */
export function ExpiringStrip({
  vouchers,
  heroVoucherId,
}: {
  vouchers: CampaignVoucher[];
  heroVoucherId?: string;
}) {
  const t = useT();
  const { locale } = useI18n();
  const visible = vouchers.filter((v) => v.expiring_soon && v.id !== heroVoucherId);
  if (visible.length === 0) return null;

  return (
    <section aria-label={t("home.expiringSoon")}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold text-ink">{t("home.expiringSoon")}</h2>
      </div>
      <ul className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((v) => (
          <li key={v.id} className="flex-none snap-start">
            <Link
              href="/campaign-wallet"
              aria-label={`${v.reward_title} — ${shortDate(v.expires_label, locale)}`}
              className="flex items-center gap-2 rounded-xl border border-line bg-card p-3 shadow-card"
            >
              {/* amber urgency pill */}
              <span className="rounded-pill bg-amber/15 px-2 py-0.5 text-xs font-bold text-amber-deep">
                {shortDate(v.expires_label, locale)}
              </span>
              <span className="max-w-[120px] truncate text-sm font-semibold text-ink">
                {v.reward_title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loyalty voucher strip (expiring loyalty vouchers, parallel to ExpiringStrip)
// ---------------------------------------------------------------------------

/** Slim strip for loyalty vouchers expiring within the 3-day window.
 * Excluded: the one shown in the hero. */
export function ExpiringLoyaltyStrip({
  vouchers,
  heroVoucherId,
  nowMs,
}: {
  vouchers: LoyaltyVoucher[];
  heroVoucherId?: string;
  nowMs: number;
}) {
  const { locale } = useI18n();
  // Same 3-day window the campaign-voucher adapter uses for expiring_soon.
  const WINDOW = 3 * 24 * 60 * 60 * 1000;
  const visible = vouchers.filter((v) => {
    if (v.id === heroVoucherId) return false;
    if (!v.expires_at) return false;
    const diff = new Date(v.expires_at).getTime() - nowMs;
    return diff >= 0 && diff <= WINDOW;
  });
  if (visible.length === 0) return null;

  return (
    <ul className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {visible.map((v) => (
        <li key={v.id} className="flex-none snap-start">
          <Link
            href="/rewards"
            aria-label={`${v.reward_title} — ${shortDate(v.expires_at!, locale)}`}
            className="flex items-center gap-2 rounded-xl border border-line bg-card p-3 shadow-card"
          >
            <span className="rounded-pill bg-amber/15 px-2 py-0.5 text-xs font-bold text-amber-deep">
              {shortDate(v.expires_at!, locale)}
            </span>
            <span className="max-w-[120px] truncate text-sm font-semibold text-ink">
              {v.reward_title}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Discover rail
// ---------------------------------------------------------------------------

type DiscoverBusiness = {
  id: string;
  name: string;
  category: string;
  area: string;
  logo_url: string | null;
};

/** Deduplicate businesses from campaign feed discover list. */
export function dedupeBusinesses(
  discover: Array<{ business: DiscoverBusiness }>,
): DiscoverBusiness[] {
  const seen = new Set<string>();
  const result: DiscoverBusiness[] = [];
  for (const item of discover) {
    if (!seen.has(item.business.id)) {
      seen.add(item.business.id);
      result.push(item.business);
    }
  }
  return result;
}

/** Horizontal discover rail — always shown when businesses exist.
 * Falls back to an empty-state card if discover is empty. */
export function DiscoverRail({
  businesses,
}: {
  businesses: DiscoverBusiness[];
}) {
  const t = useT();

  return (
    <section aria-label={t("home.discover")}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display font-bold text-ink">{t("home.discover")}</h2>
        <Link href="/nearby" className="text-sm font-semibold text-brand">
          {t("home.all")}
        </Link>
      </div>

      {businesses.length === 0 ? (
        /* §10 empty-state card */
        <Link
          href="/nearby"
          className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-cream p-6 text-center"
          aria-label={t("home.discover")}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-tile text-2xl">
            🗺️
          </div>
          <p className="font-display font-bold text-ink">{t("nav.nearby")}</p>
        </Link>
      ) : (
        <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {businesses.map((biz) => (
            <li key={biz.id} className="flex-none snap-start">
              <Link
                href={`/nearby/${biz.id}`}
                aria-label={biz.name}
                className="flex w-36 flex-col gap-2 rounded-xl border border-line bg-card p-3 shadow-card"
              >
                {/* logo or initials tile */}
                {biz.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={biz.logo_url}
                    alt=""
                    className="h-10 w-10 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-tile font-display text-base font-bold text-brand">
                    {biz.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <p className="line-clamp-2 text-sm font-bold leading-tight text-ink">{biz.name}</p>
                <p className="truncate text-xs text-subtle">{biz.category}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Rail skeletons
// ---------------------------------------------------------------------------

export function RailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 w-36 flex-none animate-pulse rounded-xl bg-tile" />
      ))}
    </div>
  );
}
