"use client";

/**
 * /campaigns — unified earning surface (campaigns redesign F1).
 *
 * Three states:
 *   returning  — streak header, claimable banner, vessel hero, stats strip,
 *                in-progress list, earned shelf, popular teasers.
 *   early      — same but stats strip hidden (rewards_earned === 0), streak "1 wk".
 *   empty/new  — starter mission: pick 1 of 3 nearby joinable cards → show QR.
 *
 * Win moment — full-screen confetti overlay when a scan fills the cup
 * (detected via polling: my_progress.completed flips true while on this tab).
 * Confetti gated by useReducedMotion().
 */

import {
  useCampaignFeed,
  useCampaignWallet,
  useLoyaltyCards,
  useLoyaltyHomeSummary,
  useLoyaltyVouchers,
  useMyGroups,
  useNearby,
  useJoinCampaign,
  type Campaign,
  type CampaignVoucher,
  type LoyaltyCardView,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import { useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CustomerShell } from "../_components/CustomerShell";
import { CampaignCard, DiscoverRow, GlyphTile } from "../_components/campaigns";
import { useRequireAuth } from "../_lib/auth";
import { useUserLocation } from "../_lib/useUserLocation";
import { Confetti } from "./_components/Confetti";
import { VesselHero } from "./_components/VesselHero";
import { pickCampaignsHero } from "./_lib/pickCampaignsHero";

// --- Win moment overlay -------------------------------------------------------

interface WinOverlayProps {
  rewardTitle: string;
  onClose: () => void;
  voucherId: string | null;
}

function WinOverlay({ rewardTitle, onClose, voucherId }: WinOverlayProps) {
  const t = useT();
  const reducedMotion = useReducedMotion() ?? false;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={t("cmp.home.win.title")}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink/80 p-6 animate-jq-rise"
    >
      {!reducedMotion && <Confetti />}

      <div
        className={cn(
          "relative w-full max-w-sm rounded-[24px] bg-card p-8 text-center shadow-modal",
          !reducedMotion && "animate-jq-card-up",
        )}
      >
        <div className="text-5xl" aria-hidden>🏆</div>
        <h2 className="mt-4 font-display text-2xl font-bold text-ink">
          {t("cmp.home.win.title")}
        </h2>
        <p className="mt-2 font-display text-lg font-semibold text-brand">
          {t("cmp.home.win.subtitle").replace("{reward}", rewardTitle)}
        </p>
        <p className="mt-3 text-[13.5px] text-subtle">{t("cmp.home.win.hint")}</p>

        <div className="mt-6 flex flex-col gap-3">
          {voucherId ? (
            <Link
              href={`/campaign-wallet/${voucherId}`}
              className="block rounded-pill bg-brand px-6 py-3 text-center font-semibold text-white shadow-glow"
            >
              {t("cmp.home.win.wallet")}
            </Link>
          ) : (
            <Link
              href="/campaign-wallet"
              className="block rounded-pill bg-brand px-6 py-3 text-center font-semibold text-white shadow-glow"
            >
              {t("cmp.home.win.wallet")}
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill border border-line px-6 py-3 text-center font-semibold text-ink"
          >
            {t("cmp.home.win.back")}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Claimable banner ---------------------------------------------------------

function ClaimableBanner({ vouchers }: { vouchers: CampaignVoucher[] }) {
  const t = useT();
  if (vouchers.length === 0) return null;
  // vouchers is non-empty (checked above).
  const first = vouchers[0] as NonNullable<typeof vouchers[0]>;

  return (
    <Link
      href="/campaign-wallet"
      className="flex items-center gap-3 rounded-2xl bg-sage-soft p-4 transition active:scale-[.99]"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-sage text-white text-lg" aria-hidden>
        🎁
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[14px] text-ink">{t("cmp.home.claimable.title")}</p>
        <p className="mt-0.5 truncate text-[12.5px] text-subtle">{first.reward_title} · {t("cmp.home.claimable.hint")}</p>
      </div>
      <span className="flex-none text-subtle" aria-hidden>›</span>
    </Link>
  );
}

// --- Stats strip --------------------------------------------------------------

interface StatsStripProps {
  rewardsEarned: number;
  somSaved: string;
  streakWeeks: number;
}

function StatsStrip({ rewardsEarned, somSaved, streakWeeks }: StatsStripProps) {
  const t = useT();

  return (
    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-cream border border-line p-4">
      <div className="text-center">
        <p className="font-display text-xl font-bold text-ink">{rewardsEarned}</p>
        <p className="mt-0.5 text-[11px] text-subtle leading-tight">{t("cmp.home.stats.rewards").replace("{n}", "")}</p>
      </div>
      <div className="text-center border-x border-line">
        <p className="font-display text-xl font-bold text-ink">{somSaved}</p>
        <p className="mt-0.5 text-[11px] text-subtle leading-tight">{t("cmp.home.stats.saved").replace("{n}", "")}</p>
      </div>
      <div className="text-center">
        <p className="font-display text-xl font-bold text-ink">{streakWeeks}</p>
        <p className="mt-0.5 text-[11px] text-subtle leading-tight">{t("cmp.home.stats.streak").replace("{n}", "")}</p>
      </div>
    </div>
  );
}

// --- In-progress list ---------------------------------------------------------

interface InProgressRowProps {
  campaign: Campaign;
}

function InProgressRow({ campaign: c }: InProgressRowProps) {
  const t = useT();
  const p = c.my_progress;
  const isGroup = c.campaign_type === "group";
  const current = p?.current_count ?? 0;
  const target = p?.target_count ?? c.rule.required_count ?? 0;
  const pct = target > 0 ? Math.round((current / target) * 100) : 0;

  return (
    <Link
      href={isGroup ? `/campaigns/${c.id}/group` : `/campaigns/${c.id}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3.5 transition active:scale-[.99]"
    >
      <GlyphTile glyph={c.glyph || (isGroup ? "👥" : "⭐")} size={42} image={c.business.logo_url} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-[14px] text-ink">{c.name}</p>
          {c.days_left > 0 && c.days_left <= 7 && (
            <span className="flex-none rounded-pill bg-amber/10 px-2 py-0.5 text-[10.5px] font-semibold text-amber-deep">
              {c.days_left}d
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-0.5 text-[11.5px] text-subtle">{current}/{target}</p>
      </div>
      {isGroup && (
        <span className={cn("flex-none rounded-pill border border-brand px-2.5 py-1 text-[12px] font-semibold text-brand")}>
          {t("cmp.home.inprogress.invite")}
        </span>
      )}
    </Link>
  );
}

// --- Earned shelf -------------------------------------------------------------

function EarnedShelf({ vouchers }: { vouchers: CampaignVoucher[] }) {
  const t = useT();
  if (vouchers.length === 0) return null;

  return (
    <section>
      <h2 className="font-display text-lg font-bold text-ink">{t("cmp.home.earned.title")}</h2>
      <div className="mt-3 flex flex-col gap-2.5">
        {vouchers.slice(0, 3).map((v) => (
          <Link
            key={v.id}
            href={`/campaign-wallet/${v.id}`}
            className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3.5"
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-sage text-white text-base" aria-hidden>🎟️</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-ink">{v.reward_title}</p>
              <p className="text-[12px] text-subtle">{v.business.name}</p>
            </div>
            <span className="flex-none text-[12px] text-brand font-semibold">{t("cmp.home.earned.view")}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// --- Empty / new user: starter mission ----------------------------------------

function StarterMission({ nearby }: { nearby: Campaign[] }) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const joinMutation = useJoinCampaign();

  const starters = nearby.slice(0, 3);

  async function handleJoin() {
    if (!selected) return;
    try {
      await joinMutation.mutateAsync(selected);
      setJoined(true);
    } catch {
      // Error surfaced by mutation state — no throw here.
    }
  }

  const selectedCampaign = starters.find((c) => c.id === selected);

  if (joined && selectedCampaign) {
    return (
      <div className="rounded-2xl border border-line bg-card p-5 text-center">
        <p className="font-display text-lg font-bold text-ink">
          {t("cmp.home.empty.showQr").replace("{business}", selectedCampaign.business.name)}
        </p>
        <Link
          href="/visit-qr"
          className="mt-4 block rounded-pill bg-brand px-6 py-3 font-semibold text-white shadow-glow"
        >
          {t("cmp.home.hero.showQr")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <p className="font-semibold text-[14px] text-ink">{t("cmp.home.empty.pick")}</p>
      <div className="mt-3 flex flex-col gap-2.5">
        {starters.map((c) => {
          const isSelected = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                isSelected ? "border-brand bg-brand/5" : "border-line bg-cream",
              )}
              aria-pressed={isSelected}
            >
              <GlyphTile glyph={c.glyph || "☕"} size={38} image={c.business.logo_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-[13.5px] text-ink">{c.business.name}</p>
                <p className="text-[12px] text-subtle">{c.reward.title}</p>
              </div>
              <span
                className={cn(
                  "flex-none h-4 w-4 rounded-full border-2 transition",
                  isSelected ? "border-brand bg-brand" : "border-line",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      {selected && (
        <button
          type="button"
          onClick={() => { void handleJoin(); }}
          disabled={joinMutation.isPending}
          className="mt-4 w-full rounded-pill bg-brand px-6 py-3 font-semibold text-white shadow-glow disabled:opacity-60"
        >
          {joinMutation.isPending ? "…" : t("cmp.home.empty.join")}
        </button>
      )}
    </div>
  );
}

// --- Main page ----------------------------------------------------------------

// Poll interval for the in-progress feed so a staff-side scan reflects promptly.
// 15s matches the visit-qr page's polling rhythm.
const FEED_POLL_MS = 15_000;

// An "active" group is still in motion.
const ACTIVE_GROUP_STATUSES: NonNullable<ReturnType<typeof useMyGroups>["data"]>[number]["status"][] =
  ["forming", "full", "checking_in"];

export default function CampaignsPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  const userLoc = useUserLocation();

  // Server state — all polled so a staff scan shows up while the tab is open.
  const feedQuery = useCampaignFeed(undefined, undefined, { refetchInterval: FEED_POLL_MS });
  const homeSummaryQuery = useLoyaltyHomeSummary();
  const cardsQuery = useLoyaltyCards();
  const walletQuery = useCampaignWallet({ refetchInterval: FEED_POLL_MS });
  const loyaltyVouchersQuery = useLoyaltyVouchers();
  const myGroupsQuery = useMyGroups({ refetchInterval: FEED_POLL_MS });
  const nearbyQuery = useNearby({ limit: 6 });

  // Win moment detection: track previous completed set, fire when a new one flips.
  const prevCompleted = useRef(new Set<string>());
  const [winVoucherId, setWinVoucherId] = useState<string | null>(null);
  const [winReward, setWinReward] = useState("");
  const [showWin, setShowWin] = useState(false);

  const feedData = feedQuery.data;
  const followed = feedData?.followed ?? [];
  const discover = feedData?.discover ?? [];

  // Detect new completions on each poll tick. Depend on feedData (stable ref when
  // data hasn't changed) rather than the derived `followed` array which would be
  // a new reference every render.
  useEffect(() => {
    const currentFollowed = feedData?.followed ?? [];
    for (const c of currentFollowed) {
      const p = c.my_progress;
      if (p?.completed && !prevCompleted.current.has(c.id)) {
        setWinReward(c.reward.title);
        setWinVoucherId(p.voucher_id);
        setShowWin(true);
      }
    }
    prevCompleted.current = new Set(
      currentFollowed.filter((c) => c.my_progress?.completed).map((c) => c.id),
    );
  }, [feedData]);

  // Active loyalty vouchers = claimable.
  const activeLoyaltyVouchers = loyaltyVouchersQuery.data?.active ?? [];
  // Active campaign vouchers = claimable.
  const activeCampaignVouchers = walletQuery.data?.active ?? [];
  const allClaimable = [...activeCampaignVouchers, ...activeLoyaltyVouchers.map(
    // Bridge loyalty voucher to partial CampaignVoucher shape for the banner.
    (v) => ({
      id: v.id,
      reward_title: v.reward_title,
      business: { id: v.business, name: v.business_name },
    } as CampaignVoucher),
  )];

  // Used vouchers for earned shelf.
  const usedVouchers = walletQuery.data?.used ?? [];

  // Cards for hero selection.
  const cards: LoyaltyCardView[] = cardsQuery.data ?? [];

  // Claimable ids to exclude from hero.
  const claimableIds = new Set([
    ...activeCampaignVouchers.map((v) => v.campaign.id),
    // For loyalty, map by program id (not available from CampaignVoucher bridge above).
    ...activeLoyaltyVouchers.map((v) => v.program),
  ]);

  const heroResult = pickCampaignsHero({ loyaltyCards: cards, followed, claimableIds });

  const summary = homeSummaryQuery.data;
  const rewardsEarned = summary?.rewards_earned ?? 0;
  const somSaved = summary?.som_saved ?? "0";
  const streakWeeks = summary?.visit_streak_weeks ?? 1;

  const inProgressCampaigns = followed.filter((c) => c.my_progress && !c.my_progress.completed);
  const myActiveGroup = myGroupsQuery.data?.find((g) => ACTIVE_GROUP_STATUSES.includes(g.status));

  // Determine state.
  const isNew = rewardsEarned === 0 && cards.length === 0 && followed.length === 0;
  const isEarly = !isNew && rewardsEarned === 0;

  // Nearby joinable campaigns for new-user starter mission.
  const nearbyJoinable = discover.filter((c) => !c.my_progress?.joined).slice(0, 3);

  // Popular near you teasers (not yet joined).
  const popularTeasers = discover.filter((c) => !c.my_progress?.joined).slice(0, 4);

  if (!isAuthenticated) return null;

  return (
    <CustomerShell title={t("cmp.home.title")} hideChromeTitle>
      {/* Win moment overlay */}
      {showWin && (
        <WinOverlay
          rewardTitle={winReward}
          voucherId={winVoucherId}
          onClose={() => setShowWin(false)}
        />
      )}

      <div className="flex flex-col gap-6 pb-8">
        {/* Header */}
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
            {t("cmp.home.title")}
          </p>
          <div className="mt-0.5 flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold text-ink">
              {isNew ? t("cmp.home.empty.title") : t("cmp.home.subtitle")}
            </h1>
            {/* Streak chip */}
            {!isNew && (
              <span
                className={cn(
                  "flex items-center gap-1 rounded-pill bg-[#FBEFD9] px-3 py-1 text-[13px] font-bold text-amber-deep",
                )}
                aria-label={`${streakWeeks} week streak`}
              >
                <span aria-hidden className="animate-jq-flame inline-block">🔥</span>
                {t("cmp.home.streak").replace("{n}", String(streakWeeks))}
              </span>
            )}
          </div>
          {isNew && (
            <p className="mt-1 text-[13.5px] text-subtle">{t("cmp.home.empty.subtitle")}</p>
          )}
        </header>

        {/* New user: starter mission */}
        {isNew && (
          <StarterMission nearby={nearbyJoinable} />
        )}

        {!isNew && (
          <>
            {/* Claimable banner */}
            {allClaimable.length > 0 && (
              <ClaimableBanner vouchers={allClaimable} />
            )}

            {/* Vessel hero */}
            {heroResult.kind !== "empty" && (
              <VesselHero result={heroResult} />
            )}

            {/* Active group banner */}
            {myActiveGroup && (
              <Link
                href={`/campaigns/${myActiveGroup.campaign_id}/group`}
                className="flex items-center gap-3 rounded-2xl bg-[linear-gradient(135deg,#C25E3C,#E7A23E)] p-4 text-white shadow-glow transition active:scale-[.99]"
              >
                <GlyphTile glyph="👥" size={46} image={myActiveGroup.business_logo_url} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[15px] font-bold">{t("cmp.group.banner.title")}</p>
                  <p className="mt-0.5 truncate text-[12.5px] opacity-90">
                    {t("cmp.group.banner.subtitle")
                      .replace("{business}", myActiveGroup.business_name)
                      .replace("{joined}", String(myActiveGroup.joined_count))
                      .replace("{size}", String(myActiveGroup.required_size))}
                  </p>
                </div>
                <span className="flex-none text-xl opacity-90" aria-hidden>›</span>
              </Link>
            )}

            {/* Stats strip (hidden for early users: rewards_earned === 0) */}
            {!isEarly && (
              <StatsStrip
                rewardsEarned={rewardsEarned}
                somSaved={somSaved}
                streakWeeks={streakWeeks}
              />
            )}

            {/* In-progress list */}
            {inProgressCampaigns.length > 0 && (
              <section>
                <h2 className="font-display text-lg font-bold text-ink">{t("cmp.home.inprogress.title")}</h2>
                <div className="mt-3 flex flex-col gap-2.5">
                  {inProgressCampaigns.map((c) => (
                    <InProgressRow key={c.id} campaign={c} />
                  ))}
                </div>
              </section>
            )}

            {/* Earned shelf */}
            {usedVouchers.length > 0 && (
              <EarnedShelf vouchers={usedVouchers} />
            )}

            {/* Popular near you teasers */}
            {popularTeasers.length > 0 && (
              <section>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-ink">{t("cmp.home.popular.title")}</h2>
                  <Link href="/campaigns/discover" className="text-[13px] font-semibold text-brand">
                    {t("cmp.home.patches.cta")}
                  </Link>
                </div>
                <div className="mt-3 flex flex-col gap-2.5">
                  {popularTeasers.map((c) => (
                    <DiscoverRow key={c.id} campaign={c} userLoc={userLoc} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </CustomerShell>
  );
}
