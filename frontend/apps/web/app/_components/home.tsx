"use client";

import type { Business, Campaign, CampaignNotice, CampaignVoucher, LoyaltyCardView, LoyaltyVoucher } from "@jaqyn/api";
import { useI18n, useT } from "@jaqyn/i18n";
import { Sheet } from "@jaqyn/ui";
import Link from "next/link";
import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import { buildWallet, ACCENT_BG, programReady } from "../loyalty/_lib/wallet";
import type { HeroResult } from "../_lib/pickHero";
import { isOpenNow } from "../_lib/hours";
import { FlagIcon, GiftIcon, PinIcon, UsersIcon, WalletIcon } from "./icons";
import { MiniMap } from "./MiniMap";

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

  if (hero.kind === "map") {
    const mapBusinesses = hero.businesses.slice(0, 8);
    return (
      <div className="relative h-64 overflow-hidden rounded-modal border border-line bg-tile shadow-card">
        <MiniMap
          bare
          userLocation={null}
          pins={mapBusinesses.map((business, index) => ({
            id: business.id,
            initial: business.glyph || business.name.slice(0, 1).toUpperCase(),
            name: business.name,
            closest: index === 0,
            lat: business.latitude ? Number(business.latitude) : null,
            lng: business.longitude ? Number(business.longitude) : null,
            logoUrl: business.logo_url,
            reward: business.reward ?? undefined,
          }))}
        />
        {mapBusinesses.length > 0 && (
          <span className="absolute left-4 top-4 z-10 rounded-pill bg-card px-3 py-1.5 text-xs font-bold text-ink shadow-card">
            {t("home.placesOnMap").replace("{count}", String(hero.businesses.length))}
          </span>
        )}
        <Link
          href="/nearby"
          className="absolute inset-x-6 bottom-5 z-10 inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-card px-5 text-center font-display text-lg font-bold text-ink shadow-card"
        >
          <PinIcon className="h-5 w-5 text-brand" />
          {t("home.exploreMap")}
        </Link>
      </div>
    );
  }

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

  if (hero.kind === "cashback") {
    return (
      <Link
        href={hero.href}
        className={`relative flex min-h-64 flex-col overflow-hidden rounded-modal ${hero.accentClass} p-6 text-white shadow-glow`}
        aria-label={`${hero.business} — ${t("home.cashbackReady")}`}
      >
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
        <span className="absolute -bottom-8 -right-5 text-8xl opacity-10" aria-hidden>🥐</span>
        <div className="relative flex items-center justify-between gap-3 text-xs font-extrabold uppercase tracking-wider">
          <span>{t(hero.ready ? "home.cashbackReady" : "home.cashbackBalance")}</span>
          <span className="rounded-pill bg-white/20 px-3 py-1 normal-case tracking-normal">{hero.business}</span>
        </div>
        <p className="relative mt-7 flex items-baseline gap-2 font-display">
          <span className="text-5xl font-extrabold leading-none">{hero.amount}</span>
          <span className="text-lg font-bold">{t("home.somToSpend")}</span>
        </p>
        {hero.progressPct != null && (
          <div className="relative mt-6 h-2.5 overflow-hidden rounded-pill bg-white/25">
            <div className="h-full rounded-pill bg-white" style={{ width: `${hero.progressPct}%` }} />
          </div>
        )}
        <div className="relative mt-auto flex items-end justify-between gap-3 pt-6">
          <span className="min-w-0 text-sm font-bold">{hero.rewardLabel}</span>
          <span className="inline-flex min-h-12 min-w-28 flex-none items-center justify-center rounded-pill bg-white px-5 py-3 text-center text-sm font-bold leading-tight text-ink shadow-card">{t("home.useNow")} ›</span>
        </div>
      </Link>
    );
  }

  if (hero.source === "campaign" && hero.cashbackReward) {
    const progressPct = hero.total > 0 ? Math.round((hero.current / hero.total) * 100) : 0;
    return (
      <Link
        href={hero.href}
        className="relative flex h-[300px] flex-col overflow-hidden rounded-reward-card bg-wallet-sage p-reward-card text-white shadow-reward-card"
        aria-label={`${hero.title} — ${hero.business}`}
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 -left-12 h-44 w-44 rounded-full bg-white/10" />

        <div className="relative flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <BusinessLogo name={hero.business} url={hero.businessLogoUrl ?? null} size="medium" />
            <span className="min-w-0">
              <span className="inline-flex rounded-pill bg-white/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                {t("home.cashbackCampaign")}
              </span>
              <span className="mt-1 block truncate text-base font-bold">{hero.business}</span>
            </span>
          </span>
          <span className="rounded-pill bg-white/20 px-3 py-1.5 text-sm font-extrabold">
            {hero.current}/{hero.total}
          </span>
        </div>

        <div className="relative mt-5 flex items-center gap-4">
          <span className="flex h-20 w-20 flex-none items-center justify-center rounded-full border border-white/30 bg-white/15 font-display text-2xl font-extrabold shadow-card" aria-hidden>
            сом
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-white/70">{t("home.cashbackUnlock")}</p>
            <p className="mt-1 font-display text-2xl font-extrabold leading-tight">{hero.title}</p>
          </div>
        </div>

        <div className="relative mt-5">
          <div className="h-2.5 overflow-hidden rounded-pill bg-white/25" aria-hidden>
            <div className="h-full rounded-pill bg-white" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="mt-2 text-xs font-semibold text-white/75">
            {t("home.cashbackProgress")
              .replace("{current}", String(hero.current))
              .replace("{total}", String(hero.total))}
          </p>
        </div>

        <span className="relative mt-auto flex min-h-14 w-full items-center justify-center rounded-xl bg-white px-4 text-base font-bold text-sage-deep shadow-card">
          {t("home.viewCashback")} ›
        </span>
      </Link>
    );
  }

  // progress variant
  const complete = hero.current >= hero.total;
  const open = hero.businessHours ? isOpenNow(hero.businessHours) !== false : true;
  return (
    <Link
      href={complete ? "/rewards" : hero.href}
      className={`relative flex h-[300px] flex-col overflow-hidden rounded-reward-card border p-reward-card text-ink shadow-reward-card ${complete ? "border-reward-ready-border bg-reward-ready" : "border-line bg-reward-progress"}`}
      aria-label={`${hero.title} — ${hero.business}`}
    >
      <div className="relative flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <BusinessLogo name={hero.business} url={hero.businessLogoUrl ?? null} size="medium" />
          <span className="min-w-0">
            <span className={`mb-1 inline-flex w-fit items-center gap-1 rounded-pill px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${hero.source === "loyalty" ? "bg-tile text-subtle" : "bg-brand-muted text-amber-deep"}`}>
              <span aria-hidden>{hero.source === "loyalty" ? "↻" : "⚡"}</span>
              {t(hero.source === "loyalty" ? "home.loyaltyCard" : "home.campaignCard")}
            </span>
            <span className="block truncate text-base font-bold">{hero.business}</span>
            <span className={`block truncate text-sm font-semibold ${open ? "text-sage" : "text-subtle"}`}>
              {t(open ? "nearby.open" : "nearby.closed")} · {hero.businessArea || hero.business}
            </span>
          </span>
        </span>
        <span className={`flex-none whitespace-nowrap rounded-pill px-3 py-1.5 text-sm font-extrabold ${complete ? "bg-sage-soft text-sage" : "bg-reward-warm text-brand"}`}>{hero.current} / {hero.total}</span>
      </div>
      <p className="relative mt-4 font-display text-xl font-bold leading-snug">{hero.title}</p>
      {complete && <span className="relative mt-2 inline-flex w-fit items-center gap-1.5 rounded-pill bg-sage-soft px-3 py-1 text-xs font-bold text-sage"><span className="h-1.5 w-1.5 rounded-full bg-sage" />{t("home.readyToRedeem")}</span>}
      <div className="relative mb-5 mt-4 flex items-center gap-1.5" aria-label={`${hero.current} / ${hero.total}`}>
        {Array.from({ length: Math.min(hero.total, 8) }, (_, index) => (
          <span key={index} aria-hidden className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-extrabold ${index < hero.current ? "bg-brand-gradient text-white shadow-card" : "border border-dashed border-handle bg-cream text-transparent"}`}>✓</span>
        ))}
        {hero.total > 8 && <span className="ml-1 text-xs font-bold text-subtle">{hero.current} / {hero.total}</span>}
      </div>
      <span className={`relative mt-auto flex min-h-14 w-full items-center justify-center rounded-xl border px-4 text-base font-bold ${complete ? "border-brand bg-brand text-white shadow-reward-cta" : open ? "border-[1.5px] border-ink bg-card text-ink" : "border-line bg-tile text-subtle"}`}>
        {t(complete ? "home.redeemNow" : open ? "home.viewCard" : "home.remindMe")}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Hero skeleton
// ---------------------------------------------------------------------------

export function HeroSkeleton() {
  const t = useT();
  return (
    <section>
      <h2 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-subtle">{t("home.almostThere")}</h2>
      <div className="h-[300px] animate-pulse rounded-reward-card bg-tile" />
    </section>
  );
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

// ---------------------------------------------------------------------------
// Home redesign composition
// ---------------------------------------------------------------------------

// Mirrors Tailwind `gap-3`; included in each full-card snap step.
const HERO_GAP_PX = 12;

export function carouselIndex(scrollLeft: number, clientWidth: number, count: number): number {
  if (clientWidth <= 0 || count <= 1) return 0;
  return Math.max(
    0,
    Math.min(count - 1, Math.round(scrollLeft / (clientWidth + HERO_GAP_PX))),
  );
}

export function HomeHeroCarousel({ heroes, collectingCount = heroes.length }: { heroes: HeroResult[]; collectingCount?: number }) {
  const t = useT();
  const showWalletTail = collectingCount > heroes.length;
  const slideCount = heroes.length + (showWalletTail ? 1 : 0);
  const rail = useRef<HTMLUListElement>(null);
  const drag = useRef({ pointerId: -1, startX: 0, startScroll: 0, moved: false });
  const suppressClick = useRef(false);
  const programmaticTarget = useRef<number | null>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout>>();

  function settleRail(node: HTMLUListElement) {
    if (node.clientWidth === 0) return;
    const card = node.querySelector<HTMLElement>("[data-home-hero]");
    const step = (card?.offsetWidth || node.clientWidth) + HERO_GAP_PX;
    const index = carouselIndex(node.scrollLeft, card?.offsetWidth || node.clientWidth, slideCount);
    goToSlide(index, step);
  }

  function goToSlide(index: number, knownStep?: number) {
    const node = rail.current;
    if (!node) return;
    const card = node.querySelector<HTMLElement>("[data-home-hero]");
    const step = knownStep ?? (card?.offsetWidth || node.clientWidth) + HERO_GAP_PX;
    const target = index * step;
    programmaticTarget.current = index;
    node.style.scrollSnapType = "none";
    node.scrollTo({ left: target, behavior: "smooth" });
    clearTimeout(snapTimer.current);
    // Matches the carousel's smooth motion, then locks exactly to the card edge.
    snapTimer.current = setTimeout(() => {
      node.style.scrollSnapType = "x mandatory";
      node.scrollLeft = target;
      programmaticTarget.current = null;
    }, 420);
  }

  function startDrag(event: ReactPointerEvent<HTMLUListElement>) {
    if (event.pointerType === "touch" || event.button > 0) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: event.currentTarget.scrollLeft,
      moved: false,
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLUListElement>) {
    if (drag.current.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.current.startX;
    // Six pixels separates an intentional drag from an ordinary card click.
    if (Math.abs(delta) >= 6 && !drag.current.moved) {
      drag.current.moved = true;
      event.currentTarget.style.scrollSnapType = "none";
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!drag.current.moved) return;
    event.preventDefault();
    event.currentTarget.scrollLeft = drag.current.startScroll - delta;
  }

  function endDrag(event: ReactPointerEvent<HTMLUListElement>) {
    if (drag.current.pointerId !== event.pointerId) return;
    const moved = drag.current.moved;
    suppressClick.current = moved;
    drag.current.pointerId = -1;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (moved) {
      settleRail(event.currentTarget);
    } else {
      // A tap is a link activation, not a carousel movement. Restoring snap
      // without scrolling keeps the browser's pending click intact.
      event.currentTarget.style.scrollSnapType = "x mandatory";
    }
    requestAnimationFrame(() => {
      suppressClick.current = false;
    });
  }

  return (
    <section aria-label={t("home.almostThere")}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-ink">
          {t("home.almostThere")}
        </h2>
      </div>
      <ul
        ref={rail}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragStart={(event) => event.preventDefault()}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        className="flex cursor-grab snap-x snap-mandatory select-none gap-3 overflow-x-auto touch-pan-x active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {heroes.map((hero, index) => (
          <li
            key={`${hero.kind}-${index}`}
            data-home-hero
            className="w-[300px] flex-none snap-start"
          >
            <HeroCard hero={hero} />
          </li>
        ))}
        {showWalletTail && (
          <li data-home-hero className="w-[300px] flex-none snap-start">
            <Link href="/loyalty" className="flex h-[300px] flex-col items-center justify-center rounded-reward-card border border-line bg-reward-progress p-reward-card text-center shadow-reward-card">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-tile text-brand" aria-hidden>
                <WalletIcon className="h-6 w-6" />
              </span>
              <span className="mt-4 font-display text-base font-bold text-brand">{t("home.viewAllWallet")}</span>
              <span className="mt-1 text-xs text-subtle">{t("home.cardsCollecting").replace("{count}", String(collectingCount))}</span>
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

export function CampaignNoticeBanner({
  notice,
  onSeen,
}: {
  notice: CampaignNotice;
  onSeen: (id: string) => void;
}) {
  const t = useT();
  return (
    <aside className="relative rounded-xl border border-line bg-reward-progress p-4 shadow-card">
      <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-brand">{t("home.newCampaign")}</p>
      <Link
        href={`/campaigns/${notice.campaign_id}`}
        onClick={() => onSeen(notice.id)}
        className="flex min-w-0 items-center gap-3 pr-10"
      >
        <BusinessLogo
          name={notice.business_name}
          url={notice.business_logo_url}
          size="medium"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink">
            {notice.business_name}
          </span>
          <span className="block truncate text-sm font-semibold text-brand">{notice.reward_title}</span>
          <span className="mt-0.5 block truncate text-xs text-subtle">{notice.campaign_name}</span>
        </span>
        <span className="ml-auto text-xl text-subtle" aria-hidden>›</span>
      </Link>
      <button
        type="button"
        onClick={() => onSeen(notice.id)}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-tile text-xl text-subtle"
        aria-label={t("home.dismissCampaignNotice")}
      >
        ×
      </button>
    </aside>
  );
}

export function NearbyDiscoveryCard({ business }: { business: Business }) {
  const t = useT();
  const [visible, setVisible] = useState(true);
  if (!visible || !business.reward) return null;
  const open = isOpenNow(business.working_hours) !== false;
  return (
    <aside className="relative rounded-xl border border-line bg-reward-progress p-4 shadow-card">
      <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-brand">{t("home.newCampaign")}</p>
      <Link href={`/nearby/${business.id}`} className="flex min-w-0 items-center gap-3 pr-10">
        <BusinessLogo name={business.name} url={business.logo_url} size="medium" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink">{business.name}</span>
          <span className="block truncate text-sm font-semibold text-brand">{business.reward}</span>
          <span className="mt-0.5 block truncate text-xs text-subtle">
            {t(open ? "nearby.open" : "nearby.closed")}{business.distance_km != null ? ` · ${business.distance_km} ${t("nearby.distance")}` : business.area ? ` · ${business.area}` : ""}
          </span>
        </span>
        <span className="text-xl text-subtle" aria-hidden>›</span>
      </Link>
      <button type="button" onClick={() => setVisible(false)} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-tile text-xl text-subtle" aria-label={t("home.dismissCampaignNotice")}>×</button>
    </aside>
  );
}

export function CampaignDiscoveryCard({ campaign }: { campaign: Campaign }) {
  const t = useT();
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <aside className="relative rounded-xl border border-line bg-reward-progress p-4 shadow-card">
      <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-brand">{t("home.newCampaign")}</p>
      <Link href={`/campaigns/${campaign.id}`} className="flex min-w-0 items-center gap-3 pr-10">
        <BusinessLogo name={campaign.business.name} url={campaign.business.logo_url} size="medium" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink">{campaign.business.name}</span>
          <span className="block truncate text-sm font-semibold text-brand">{campaign.reward.title}</span>
          <span className="mt-0.5 block truncate text-xs text-subtle">{campaign.business.area}</span>
        </span>
        <span className="text-xl text-subtle" aria-hidden>›</span>
      </Link>
      <button type="button" onClick={() => setVisible(false)} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-tile text-xl text-subtle" aria-label={t("home.dismissCampaignNotice")}>×</button>
    </aside>
  );
}

export function StreakChip({
  days,
  activeToday,
  relatedHero,
}: {
  days: number;
  activeToday: boolean;
  relatedHero?: HeroResult;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const relatedHref =
    relatedHero && "href" in relatedHero ? relatedHero.href : "/loyalty";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center gap-2 rounded-pill border border-line bg-card px-3 py-2 shadow-card"
        aria-label={t("home.openStreak")}
      >
        <span aria-hidden>🔥</span>
        <span className="font-display text-base font-extrabold text-ink">{days}</span>
        <span className="text-xs font-semibold text-subtle">{t("home.dayStreak")}</span>
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        variant="modal"
        surface="card"
        ariaLabel={t("home.streakTitle")}
      >
        <div className="flex flex-col items-center px-1 pb-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-tile text-3xl" aria-hidden>
            🔥
          </span>
          <h2 className="mt-4 font-display text-2xl font-bold text-ink">
            {t("home.streakCount").replace("{count}", String(days))}
          </h2>
          <p className="mt-2 text-sm text-subtle">
            {t(activeToday ? "home.streakSafe" : "home.streakVisitToday")}
          </p>
          <p className="mt-4 rounded-xl bg-tile p-4 text-left text-sm text-ink">
            {t("home.streakLogic")}
          </p>
          <Link
            href={relatedHref}
            onClick={() => setOpen(false)}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-glow"
          >
            {t("home.viewRelatedReward")}
          </Link>
        </div>
      </Sheet>
    </>
  );
}

const EXPLORE_LINKS = [
  { href: "/nearby", key: "home.map", Icon: PinIcon },
  { href: "/campaigns?type=group", key: "home.groupDeals", Icon: UsersIcon },
  { href: "/campaigns", key: "home.campaigns", Icon: FlagIcon },
  { href: "/loyalty", key: "home.wallet", Icon: WalletIcon },
] as const;

export function ExploreHub() {
  const t = useT();
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-bold text-ink">{t("home.explore")}</h2>
      <div className="grid grid-cols-4 gap-2">
        {EXPLORE_LINKS.map(({ href, key, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-card px-1 text-center shadow-card transition active:scale-95"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10">
              <Icon className="h-6 w-6 text-brand" />
            </span>
            <span className="text-xs font-bold leading-tight text-ink">{t(key)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function BusinessLogo({
  name,
  url,
  size,
  bordered = false,
}: {
  name: string;
  url: string | null;
  size: "small" | "medium";
  bordered?: boolean;
}) {
  const sizeClass = size === "small" ? "h-9 w-9" : "h-11 w-11";
  const borderClass = bordered ? "border-2 border-card" : "";

  if (url) {
    return (
      // Media URLs can come from the API host, so the browser loads them directly.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={`${sizeClass} ${borderClass} flex-none rounded-xl bg-tile object-cover`}
      />
    );
  }

  return (
    <span className={`flex ${sizeClass} ${borderClass} flex-none items-center justify-center rounded-xl bg-tile font-display font-bold text-brand`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function WalletSummary({ cards, readyVouchers }: { cards: LoyaltyCardView[]; readyVouchers: number }) {
  const t = useT();
  const shops = buildWallet(cards.filter((card) => card.joined));
  const ready = shops.filter((shop) => shop.ready).length + readyVouchers;
  const cashback = cards.reduce((sum, card) => {
    if (!card.joined || card.type !== "points") return sum;
    return sum + Math.round(card.points_balance * Number(card.cashback_per_point ?? 1));
  }, 0);
  if (ready === 0 && cashback === 0) return null;

  return (
    <Link
      href="/loyalty"
      className="flex items-center gap-3 rounded-xl border border-line bg-card p-4 shadow-card transition active:scale-[.99]"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-sage-soft text-sage"><GiftIcon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">
          {ready > 0 && <span className="text-sage">{t("home.rewardsReady").replace("{count}", String(ready))}</span>}
          {ready > 0 && cashback > 0 && <span> · </span>}
          {cashback > 0 && <span>{t("home.cashbackSom").replace("{count}", String(cashback))}</span>}
        </p>
      </div>
      <span className="text-xl text-subtle" aria-hidden>›</span>
    </Link>
  );
}

function MiniProgressIcons({ current, total }: { current: number; total: number }) {
  // The handoff keeps the literal stamp count through eight. Larger programs
  // switch to count-only so the row never lies by proportionally condensing it.
  if (total > 8) {
    return <span className="flex-none text-xs font-extrabold text-ink">{current} / {total}</span>;
  }
  return (
    <span
      role="img"
      aria-label={`${current} / ${total}`}
      className="flex flex-none items-center gap-1"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className={`flex h-4 w-4 items-center justify-center rounded text-[9px] font-extrabold ${
            index < current
              ? "bg-brand text-white"
              : "border border-dashed border-handle bg-tile text-transparent"
          }`}
        >
          ✓
        </span>
      ))}
      <span className="ml-1 whitespace-nowrap text-[11px] font-bold text-subtle">{current} / {total}</span>
    </span>
  );
}

export function CollectingList({ cards, excludeProgramId }: { cards: LoyaltyCardView[]; excludeProgramId?: string }) {
  const t = useT();
  const visible = cards.filter((card) => card.joined && card.required_count != null && !programReady(card) && card.program_id !== excludeProgramId);
  const merchants = Array.from(
    visible.reduce((groups, card) => {
      const existing = groups.get(card.business_id) ?? [];
      existing.push(card);
      groups.set(card.business_id, existing);
      return groups;
    }, new Map<string, LoyaltyCardView[]>()),
  )
    .map(([businessId, programs]) => ({ businessId, programs }))
    .sort((a, b) => {
      const aOpen = isOpenNow(a.programs[0]!.business_hours) !== false;
      const bOpen = isOpenNow(b.programs[0]!.business_hours) !== false;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      const progress = (programs: LoyaltyCardView[]) => Math.max(...programs.map((card) => {
        const current = card.type === "stamp" ? card.stamps_count : card.type === "visit" ? card.visits_count : card.points_balance;
        return card.required_count ? current / card.required_count : 0;
      }));
      return progress(b.programs) - progress(a.programs);
    });
  if (merchants.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">{t("home.keepCollecting")}</h2>
        <Link href="/loyalty" className="text-sm font-bold text-brand">{t("home.seeAll")}</Link>
      </div>
      <div className="flex flex-col gap-2.5">
        {merchants.map(({ businessId, programs }) => {
          const merchant = programs[0]!;
          const open = isOpenNow(merchant.business_hours) !== false;
          return (
            <article key={businessId} className="overflow-hidden rounded-xl border border-line bg-card shadow-card">
              <Link href={`/loyalty?business=${encodeURIComponent(businessId)}`} className="flex items-center gap-3 p-3.5">
                <BusinessLogo name={merchant.business_name} url={merchant.business_logo_url} size="medium" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{merchant.business_name}</span>
                  <span className={`mt-0.5 block text-[11px] font-semibold ${open ? "text-sage" : "text-subtle"}`}>
                    {t(open ? "nearby.open" : "nearby.closed")} · {merchant.business_area}
                  </span>
                </span>
                <span className="text-lg text-subtle" aria-hidden>›</span>
              </Link>
              <div className="border-t border-line px-3.5">
                {programs
                  .sort((a, b) => {
                    const current = (card: LoyaltyCardView) => card.type === "stamp" ? card.stamps_count : card.type === "visit" ? card.visits_count : card.points_balance;
                    return current(b) - current(a);
                  })
                  .map((card) => {
                    const current = card.type === "stamp" ? card.stamps_count : card.type === "visit" ? card.visits_count : card.points_balance;
                    return (
                      <Link key={card.program_id} href={`/loyalty?business=${encodeURIComponent(businessId)}`} className="flex min-h-12 items-center gap-2 border-b border-line py-2.5 last:border-b-0">
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{card.name || card.reward_summary}</span>
                        {card.required_count ? <MiniProgressIcons current={current} total={card.required_count} /> : <span className="text-xs font-bold text-subtle">{current}</span>}
                      </Link>
                    );
                  })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function NewCustomerHome({ businesses, name }: { businesses: Business[]; name: string }) {
  const t = useT();
  const openBusinesses = businesses.filter((business) => isOpenNow(business.working_hours) !== false);
  const visibleBusinesses = openBusinesses.length > 0 ? openBusinesses : businesses;
  const hasOpenBusinesses = openBusinesses.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="truncate font-display text-2xl font-bold tracking-tight text-ink">
          {t("home.heyName").replace("{name}", name)}
        </h1>
        <Link
          href="/nearby"
          aria-label={t("nav.nearby")}
          className="inline-flex min-h-11 flex-none items-center gap-2 rounded-pill border border-line bg-card px-3.5 text-sm font-bold text-ink shadow-card"
        >
          <PinIcon className="h-4 w-4 text-brand" />
          {t("nav.nearby")}
        </Link>
      </header>

      <section className="relative overflow-hidden rounded-modal bg-brand-gradient p-6 text-white shadow-glow">
        <span className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/5" aria-hidden />
        <span className="relative text-xs font-extrabold uppercase tracking-wider text-white/85">{t("home.startHere")}</span>
        <h1 className="relative mt-3 max-w-xs font-display text-2xl font-extrabold leading-tight">
          {t("home.scanCollectFirst")}
        </h1>
        <p className="relative mt-3 text-sm leading-relaxed text-white/80">{t("home.scanCollectHelp")}</p>
        <div className="relative mt-4 flex gap-1.5" aria-hidden>
          {Array.from({ length: 6 }, (_, index) => <span key={index} className="h-7 w-7 rounded-lg border border-dashed border-white/60" />)}
        </div>
        <Link href="/scan" className="relative mt-5 flex min-h-14 w-full items-center justify-center rounded-xl bg-card px-5 text-sm font-bold text-ink shadow-card">
          {t("home.scanFirst")}
        </Link>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">{t("home.popularNearYou")}</h2>
          {hasOpenBusinesses ? (
            <span className="rounded-pill bg-sage-soft px-3 py-1 text-xs font-bold text-sage">{t("home.live")}</span>
          ) : businesses.length > 0 ? null : (
            <Link href="/nearby" className="text-sm font-bold text-brand">{t("home.seeAll")}</Link>
          )}
        </div>
        {visibleBusinesses.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {visibleBusinesses.slice(0, 3).map((business) => (
            <Link key={business.id} href={`/nearby/${business.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3.5">
              <BusinessLogo name={business.name} url={business.logo_url} size="medium" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{business.name}</span>
                <span className={`mt-0.5 block text-xs font-semibold ${isOpenNow(business.working_hours) === false ? "text-subtle" : "text-sage"}`}>{t(isOpenNow(business.working_hours) === false ? "nearby.closed" : "nearby.open")}{business.distance_km != null ? ` · ${business.distance_km} ${t("nearby.distance")}` : business.area ? ` · ${business.area}` : ""}</span>
                {business.reward && <span className="mt-1 block truncate text-xs font-semibold text-brand">{business.reward}</span>}
              </span>
              <span className="text-xl text-subtle" aria-hidden>›</span>
            </Link>
            ))}
            <Link href="/nearby" className="flex min-h-12 items-center justify-center rounded-xl border border-line bg-card px-5 text-sm font-bold text-brand shadow-card">
              {t("home.exploreNearby")}
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-card p-5 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-tile" aria-hidden>
              <PinIcon className="h-5 w-5 text-brand" />
            </span>
            <h3 className="mt-3 font-display text-base font-bold text-ink">{t("home.nearbyEmptyTitle")}</h3>
            <p className="mt-1 text-sm leading-relaxed text-subtle">{t("home.nearbyEmptyBody")}</p>
            <Link href="/nearby" className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-glow">
              {t("home.exploreNearby")}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
