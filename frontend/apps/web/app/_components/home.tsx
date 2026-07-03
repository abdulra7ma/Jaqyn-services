"use client";

import type { Business, CampaignNotice, CampaignVoucher, LoyaltyCardView, LoyaltyVoucher } from "@jaqyn/api";
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
          <span className="text-sm font-bold">{hero.rewardLabel}</span>
          <span className="inline-flex min-h-12 min-w-28 items-center justify-center rounded-pill bg-white px-5 py-3 text-center text-sm font-bold leading-tight text-ink shadow-card">{t("home.useNow")} ›</span>
        </div>
      </Link>
    );
  }

  // progress variant
  const pct = hero.total > 0 ? Math.min(100, Math.round((hero.current / hero.total) * 100)) : 0;
  const isStamp = hero.mechanic === "stamp";
  const halfway = hero.current / hero.total <= 0.5;
  const stampBackground = halfway ? "bg-ink" : hero.accentClass;
  const progressLabel = hero.remaining === 1 ? t("home.almostThere") : halfway ? t("home.halfway") : t("home.keepGoing");
  const open = hero.businessHours ? isOpenNow(hero.businessHours) !== false : true;
  return (
    <Link
      href={hero.href}
      className={`relative flex min-h-64 flex-col overflow-hidden rounded-modal ${isStamp ? stampBackground : hero.accentClass} p-6 text-white shadow-glow`}
      aria-label={`${hero.title} — ${hero.business}`}
    >
      <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
      {isStamp && <span className="absolute -bottom-8 -right-5 text-8xl opacity-10" aria-hidden>{halfway ? "☕" : "🫖"}</span>}
      {isStamp ? (
        <div className="relative flex items-center justify-between gap-3 text-xs font-extrabold uppercase tracking-wider text-white/90">
          <span>{progressLabel}</span>
          <span className="rounded-pill bg-white/20 px-3 py-1 normal-case tracking-normal">{hero.current} / {hero.total}</span>
        </div>
      ) : (
        <p className="relative text-sm font-semibold text-white/80">{hero.business}</p>
      )}
      <p className="relative mt-6 font-display text-2xl font-bold leading-tight">{hero.title}</p>
      {isStamp && hero.total <= 8 ? (
        <div className="relative mt-6 flex gap-2" aria-label={`${hero.current} / ${hero.total}`}>
          {Array.from({ length: hero.total }, (_, index) => (
            <span
              key={index}
              className={`flex h-10 w-10 items-center justify-center rounded-xl text-base font-extrabold ${index < hero.current ? "bg-white text-brand" : "border-2 border-dashed border-white/70 text-transparent"}`}
              aria-hidden
            >
              ✓
            </span>
          ))}
        </div>
      ) : (
        <div className="relative mt-6 h-2.5 w-full overflow-hidden rounded-pill bg-white/20">
          <div className="h-full rounded-pill bg-white" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="relative mt-auto flex items-end justify-between gap-3 pt-6 text-sm font-semibold text-white/90">
        <span>{open ? t("nearby.open") : t("nearby.closed")} · {hero.businessArea || hero.business}</span>
        <span className="inline-flex min-h-12 min-w-32 items-center justify-center rounded-pill bg-white px-5 py-3 text-center font-bold leading-tight text-ink shadow-card">
          {t(hero.source === "campaign" ? "home.openCampaign" : "home.openCard")} ›
        </span>
      </div>
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

export function HomeHeroCarousel({ heroes }: { heroes: HeroResult[] }) {
  const t = useT();
  const [active, setActive] = useState(0);
  const rail = useRef<HTMLUListElement>(null);
  const drag = useRef({ pointerId: -1, startX: 0, startScroll: 0, moved: false });
  const suppressClick = useRef(false);
  const programmaticTarget = useRef<number | null>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout>>();

  function settleRail(node: HTMLUListElement) {
    if (node.clientWidth === 0) return;
    const step = node.clientWidth + HERO_GAP_PX;
    const index = carouselIndex(node.scrollLeft, node.clientWidth, heroes.length);
    goToSlide(index, step);
  }

  function goToSlide(index: number, knownStep?: number) {
    const node = rail.current;
    if (!node) return;
    const step = knownStep ?? node.clientWidth + HERO_GAP_PX;
    const target = index * step;
    programmaticTarget.current = index;
    node.style.scrollSnapType = "none";
    setActive(index);
    node.scrollTo({ left: target, behavior: "smooth" });
    clearTimeout(snapTimer.current);
    // Matches the carousel's smooth motion, then locks exactly to the card edge.
    snapTimer.current = setTimeout(() => {
      node.style.scrollSnapType = "x mandatory";
      node.scrollLeft = target;
      setActive(index);
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
    <section aria-label={t("home.closestRewards")}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-subtle">
          {t("home.closestRewards")}
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
        onScroll={() => {
          const node = rail.current;
          if (!node || node.clientWidth === 0) return;
          if (programmaticTarget.current != null) return;
          setActive(
            carouselIndex(node.scrollLeft, node.clientWidth, heroes.length),
          );
        }}
        className="flex cursor-grab snap-x snap-mandatory select-none gap-3 overflow-x-auto touch-pan-y active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {heroes.map((hero, index) => (
          <li key={`${hero.kind}-${index}`} className="w-full flex-none snap-start">
            <HeroCard hero={hero} />
          </li>
        ))}
      </ul>
      {heroes.length > 1 && (
        <div
          className="mx-auto mt-1 flex w-fit items-center justify-center"
          role="tablist"
          aria-label={t("home.carouselPagination")}
        >
          {heroes.map((_, index) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={t("home.goToReward").replace("{count}", String(index + 1))}
              onClick={() => goToSlide(index)}
              className="flex h-11 w-11 items-center justify-center rounded-full"
            >
              <span
                aria-hidden
                className={`h-2 rounded-pill transition-all ${index === active ? "w-6 bg-brand" : "w-2 bg-handle"}`}
              />
            </button>
          ))}
        </div>
      )}
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
    <aside className="flex items-center gap-3 rounded-xl border border-line bg-card p-3 shadow-card">
      <Link
        href={`/campaigns/${notice.campaign_id}`}
        onClick={() => onSeen(notice.id)}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <BusinessLogo
          name={notice.business_name}
          url={notice.business_logo_url}
          size="medium"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold uppercase tracking-wide text-amber-deep">
            {t("home.newCampaign")}
          </span>
          <span className="block truncate text-sm font-bold text-ink">
            {notice.campaign_name}
          </span>
          <span className="block truncate text-xs text-subtle">
            {notice.business_name} · {notice.reward_title}
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={() => onSeen(notice.id)}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-xl text-subtle"
        aria-label={t("home.dismissCampaignNotice")}
      >
        ×
      </button>
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
            className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-card px-1 text-center shadow-card transition active:scale-95"
          >
            <Icon className="h-5 w-5 text-brand" />
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
  if (shops.length === 0 && ready === 0) return null;

  return (
    <Link
      href="/loyalty"
      className="flex items-center gap-3 rounded-xl border border-line bg-card p-4 shadow-card transition active:scale-[.99]"
    >
      <div className="flex -space-x-3">
        {shops.slice(0, 3).map((shop) => (
          <BusinessLogo
            key={shop.businessId}
            name={shop.businessName}
            url={shop.businessLogoUrl}
            size="small"
            bordered
          />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">{t("home.yourWallet")}</p>
        <p className="text-xs text-subtle">
          {t("home.walletCards").replace("{count}", String(shops.length))}
          {ready > 0 && <span className="font-bold text-sage"> · {t("home.readyToUse").replace("{count}", String(ready))}</span>}
        </p>
      </div>
      <span className="text-xl text-subtle" aria-hidden>›</span>
    </Link>
  );
}

function MiniProgressIcons({ current, total }: { current: number; total: number }) {
  // Six compact cells fit the trailing row without squeezing business/reward
  // copy. Larger goals are proportionally condensed into the same six cells.
  const units = Math.min(total, 6);
  const filled = total > 0 ? Math.round((Math.min(current, total) / total) * units) : 0;
  return (
    <span
      role="img"
      aria-label={`${current} / ${total}`}
      className="grid flex-none grid-cols-3 gap-1"
    >
      {Array.from({ length: units }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-extrabold ${
            index < filled
              ? "bg-brand text-white"
              : "border border-dashed border-handle bg-tile text-transparent"
          }`}
        >
          ✓
        </span>
      ))}
    </span>
  );
}

export function CollectingList({ cards, excludeProgramId }: { cards: LoyaltyCardView[]; excludeProgramId?: string }) {
  const t = useT();
  const visible = cards
    .filter((card) => card.joined && !programReady(card) && card.program_id !== excludeProgramId)
    .slice(0, 3);
  if (visible.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">{t("home.keepCollecting")}</h2>
        <Link href="/loyalty" className="text-sm font-bold text-brand">{t("home.all")}</Link>
      </div>
      <div className="flex flex-col gap-2.5">
        {visible.map((card) => {
          const current = card.type === "stamp" ? card.stamps_count : card.type === "visit" ? card.visits_count : card.points_balance;
          return (
            <Link key={card.program_id} href={`/loyalty?business=${encodeURIComponent(card.business_id)}`} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3.5">
              <BusinessLogo
                name={card.business_name}
                url={card.business_logo_url}
                size="medium"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{card.business_name}</span>
                <span className="mt-1 block truncate text-xs text-subtle">{card.reward_summary}</span>
              </span>
              {card.required_count ? (
                <MiniProgressIcons current={current} total={card.required_count} />
              ) : (
                <span
                  role="img"
                  aria-label={t("cmp.loyalty.points").replace("{count}", String(current))}
                  className="flex-none text-sage"
                >
                  <GiftIcon className="h-5 w-5" />
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function NewCustomerHome({ businesses, userLocation }: { businesses: Business[]; userLocation: { lat: number; lng: number } | null }) {
  const t = useT();
  const openBusinesses = businesses.filter((business) => isOpenNow(business.working_hours) !== false);
  const visibleBusinesses = openBusinesses.length > 0 ? openBusinesses : businesses;
  const hasOpenBusinesses = openBusinesses.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <p className="flex items-center gap-1 text-sm font-semibold text-subtle"><PinIcon className="h-4 w-4 text-brand" />{t("home.bishkek")}</p>
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-ink">
          {t("home.nearRewards").replace("{count}", String(businesses.length))}
        </h1>
        <div className="relative mt-4 h-48 overflow-hidden rounded-modal shadow-card">
          <MiniMap
            bare
            userLocation={userLocation}
            pins={businesses.map((business, index) => ({
              id: business.id,
              initial: business.glyph || business.name.slice(0, 1).toUpperCase(),
              name: business.name,
              closest: index === 0,
              lat: business.latitude ? Number(business.latitude) : null,
              lng: business.longitude ? Number(business.longitude) : null,
              logoUrl: business.logo_url,
              reward: business.reward ?? undefined,
              open: isOpenNow(business.working_hours),
            }))}
          />
          <Link href="/nearby" className="absolute inset-x-3 bottom-3 z-10 rounded-xl bg-card py-3 text-center text-sm font-bold text-ink shadow-card">
            {t("home.exploreMap")}
          </Link>
        </div>
      </section>

      <ol className="grid grid-cols-3 gap-2" aria-label={t("home.howItWorks")}>
        {["home.stepDiscover", "home.stepScan", "home.stepCollect"].map((key, index) => (
          <li key={key} className={`rounded-xl border border-line bg-card p-3 text-center ${index > 0 ? "opacity-60" : ""}`}>
            <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full font-display text-sm font-extrabold ${index === 0 ? "bg-brand text-white" : "bg-tile text-subtle"}`}>{index + 1}</span>
            <span className="mt-2 block text-xs font-bold text-ink">{t(key)}</span>
          </li>
        ))}
      </ol>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">{t(hasOpenBusinesses ? "home.openNearYou" : "home.placesNearYou")}</h2>
          {hasOpenBusinesses && <span className="rounded-pill bg-sage-soft px-3 py-1 text-xs font-bold text-sage">{t("home.live")}</span>}
        </div>
        <div className="flex flex-col gap-2.5">
          {visibleBusinesses.slice(0, 3).map((business) => (
            <Link key={business.id} href={`/nearby/${business.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3.5">
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-tile font-display font-bold text-brand">{business.glyph || business.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{business.name}</span>
                <span className="mt-0.5 block text-xs text-subtle">{business.category}{business.distance_km != null ? ` · ${business.distance_km} ${t("nearby.distance")}` : ""} · {t(isOpenNow(business.working_hours) === false ? "nearby.closed" : "nearby.open")}</span>
                {business.reward && <span className="mt-1 block truncate text-xs font-semibold text-brand">{business.reward}</span>}
              </span>
              <span className="text-xl text-subtle" aria-hidden>›</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
