import type { Business, CampaignVoucher, Campaign, LoyaltyCardView, LoyaltyVoucher } from "@jaqyn/api";
import { resolveAccent } from "../loyalty/_lib/wallet";
import { isOpenNow } from "./hours";

/**
 * Priority logic for the home hero card. Pure — no React, no side effects.
 * Inject `now` for deterministic testing.
 *
 * Priority:
 * 1. Expiring voucher — campaign voucher with `expiring_soon`, else loyalty
 *    voucher with `expires_at` within 3 days (3 = same window backend uses).
 * 2. Closest to reward — fewest steps remaining across joined stamp/visit
 *    loyalty cards and followed campaigns with progress. Ties → loyalty first.
 * 3. New-user fallback — nothing above qualifies.
 */

// 3 days in ms — same window backend uses for `expiring_soon` on loyalty vouchers.
const EXPIRY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export type HeroResult =
  | {
      kind: "voucher";
      source: "campaign" | "loyalty";
      href: string;
      title: string;
      business: string;
      businessLogoUrl?: string | null;
      urgencyLabel: string;
    }
  | {
      kind: "progress";
      source: "loyalty" | "campaign";
      href: string;
      title: string;
      business: string;
      businessLogoUrl?: string | null;
      remaining: number;
      total: number;
      current: number;
      mechanic?: "stamp" | "visit" | "campaign";
      businessId?: string;
      businessArea?: string;
      businessHours?: Record<string, [string, string]>;
      /** wallet gradient accent class for the hero card background */
      accentClass: string;
    }
  | {
      kind: "cashback";
      source: "loyalty";
      href: string;
      business: string;
      businessLogoUrl?: string | null;
      businessId: string;
      amount: number;
      progressPct: number | null;
      rewardLabel: string;
      ready: boolean;
      accentClass: string;
    }
  | { kind: "map"; businesses: Business[] }
  | { kind: "new-user" };

export interface PickHeroInputs {
  campaignVouchers: CampaignVoucher[];
  loyaltyVouchers: LoyaltyVoucher[];
  /** Only joined cards are considered. Filter before passing or pass all — we filter internally. */
  loyaltyCards: LoyaltyCardView[];
  followed: Campaign[];
  /** Backend-ranked joined campaigns; earlier ids must appear first. */
  featuredCampaignIds?: string[];
  nearbyBusinesses?: Business[];
  promoteMap?: boolean;
}

export function pickHero(inputs: PickHeroInputs, now: Date = new Date()): HeroResult {
  return pickHomeHeroes(inputs, now)[0] ?? { kind: "new-user" };
}

/** Return the ranked home carousel instead of only its first card. */
export function pickHomeHeroes(inputs: PickHeroInputs, now: Date = new Date()): HeroResult[] {
  const {
    campaignVouchers,
    loyaltyVouchers,
    loyaltyCards,
    followed,
    featuredCampaignIds = [],
  } = inputs;

  const heroes: HeroResult[] = [];

  // --- Priority 1: expiring voucher ---

  // Campaign vouchers: backend sets `expiring_soon` flag directly.
  for (const expiringCampaign of campaignVouchers.filter((v) => v.expiring_soon)) {
    heroes.push({
      kind: "voucher",
      source: "campaign",
      href: "/campaign-wallet",
      title: expiringCampaign.reward_title,
      business: expiringCampaign.business.name,
      urgencyLabel: expiringCampaign.expires_label,
    });
  }

  // Loyalty vouchers: compute the 3-day window ourselves (no `expiring_soon` field).
  const nowMs = now.getTime();
  const expiringLoyalty = loyaltyVouchers.filter((v) => {
    if (!v.expires_at) return false;
    const diff = new Date(v.expires_at).getTime() - nowMs;
    return diff >= 0 && diff <= EXPIRY_WINDOW_MS;
  });
  for (const voucher of expiringLoyalty) {
    heroes.push({
      kind: "voucher",
      source: "loyalty",
      href: "/rewards",
      title: voucher.reward_title,
      business: voucher.business_name,
      // Raw ISO date portion; HeroCard formats it locale-aware (pure fn stays
      // locale-free).
      urgencyLabel: voucher.expires_at!.slice(0, 10),
    });
  }

  // --- Priority 2: closest to reward ---

  type Candidate =
    | { source: "loyalty"; remaining: number; total: number; current: number; href: string; title: string; business: string; businessLogoUrl: string | null; businessId: string; businessArea: string; businessHours: Record<string, [string, string]>; accentClass: string; mechanic: "stamp" | "visit"; lastActivityAt: string | null }
    | { source: "campaign"; remaining: number; total: number; current: number; href: string; title: string; business: string; businessLogoUrl: string | null; accentClass: string; mechanic: "campaign" };

  const candidates: Candidate[] = [];
  const secondaryCandidates: Candidate[] = [];

  // Joined stamp/visit cards only (points cards excluded — no required_count goal).
  for (const card of loyaltyCards) {
    if (!card.joined) continue;
    if (card.type !== "stamp" && card.type !== "visit") continue;
    if (card.required_count == null) continue;
    const current = card.type === "stamp" ? card.stamps_count : card.visits_count;
    const remaining = card.required_count - current;
    if (remaining < 0) continue;
    const candidate: Candidate = {
      source: "loyalty",
      remaining,
      total: card.required_count,
      current,
      mechanic: card.type,
      href: `/loyalty?business=${encodeURIComponent(card.business_id)}`,
      title: card.reward_summary,
      business: card.business_name,
      businessLogoUrl: card.business_logo_url,
      businessId: card.business_id,
      businessArea: card.business_area,
      businessHours: card.business_hours,
      // Use the card accent for the hero gradient.
      accentClass: `bg-wallet-${resolveAccent(card.business_id, card.business_card_accent)}`,
      lastActivityAt: card.last_activity_at ?? null,
    };
    (card.type === "stamp" ? candidates : secondaryCandidates).push(candidate);
  }

  // Followed campaigns with progress.
  for (const campaign of followed) {
    const p = campaign.my_progress;
    if (!p || p.target_count == null) continue;
    const remaining = p.target_count - p.current_count;
    if (remaining < 0) continue;
    candidates.push({
      source: "campaign",
      remaining,
      total: p.target_count,
      current: p.current_count,
      mechanic: "campaign",
      href: `/campaigns/${campaign.id}`,
      title: campaign.reward.title,
      business: campaign.business.name,
      businessLogoUrl: campaign.business.logo_url,
      accentClass: "bg-brand-gradient",
    });
  }

  if (candidates.length > 0) {
    // Backend-ranked campaigns come first, then standing loyalty by proximity.
    candidates.sort((a, b) => {
      if (a.source === "campaign" && b.source !== "campaign") return -1;
      if (b.source === "campaign" && a.source !== "campaign") return 1;
      if (a.source === "campaign" && b.source === "campaign") {
        const aId = a.href.split("/").pop() ?? "";
        const bId = b.href.split("/").pop() ?? "";
        const aRank = featuredCampaignIds.indexOf(aId);
        const bRank = featuredCampaignIds.indexOf(bId);
        if (aRank !== bRank) {
          if (aRank < 0) return 1;
          if (bRank < 0) return -1;
          return aRank - bRank;
        }
      }
      if (a.remaining !== b.remaining) return a.remaining - b.remaining;
      if (a.source === "loyalty" && b.source === "loyalty") {
        return (Date.parse(b.lastActivityAt ?? "") || 0) - (Date.parse(a.lastActivityAt ?? "") || 0);
      }
      return 0;
    });
    heroes.push(
      ...candidates.map((candidate) => ({
        kind: "progress" as const,
        source: candidate.source,
        href: candidate.href,
        title: candidate.title,
        business: candidate.business,
        businessLogoUrl: candidate.businessLogoUrl,
        remaining: candidate.remaining,
        total: candidate.total,
        current: candidate.current,
        mechanic: candidate.mechanic,
        ...(candidate.source === "loyalty"
          ? {
              businessId: candidate.businessId,
              businessArea: candidate.businessArea,
              businessHours: candidate.businessHours,
            }
          : {}),
        accentClass: candidate.accentClass,
      })),
    );
  }

  for (const card of loyaltyCards) {
    if (!card.joined || card.type !== "points" || card.points_balance <= 0) continue;
    if (card.cashback_per_point == null && card.pct_back == null) continue;
    const amount = card.cashback_per_point
      ? Math.round(Number(card.cashback_per_point) * card.points_balance)
      : card.points_balance;
    heroes.push({
      kind: "cashback",
      source: "loyalty",
      href: `/loyalty?business=${encodeURIComponent(card.business_id)}`,
      business: card.business_name,
      businessLogoUrl: card.business_logo_url,
      businessId: card.business_id,
      amount,
      progressPct:
        card.min_redeem_points != null && card.min_redeem_points > 0
          ? Math.min(100, Math.round((card.points_balance / card.min_redeem_points) * 100))
          : null,
      rewardLabel: card.reward_summary,
      ready:
        card.min_redeem_points == null ||
        card.points_balance >= card.min_redeem_points,
      accentClass: "bg-wallet-amber",
    });
  }

  secondaryCandidates.sort((a, b) => {
    if (a.remaining !== b.remaining) return a.remaining - b.remaining;
    if (a.source === "loyalty" && b.source === "loyalty") {
      return (Date.parse(b.lastActivityAt ?? "") || 0) - (Date.parse(a.lastActivityAt ?? "") || 0);
    }
    return 0;
  });
  heroes.push(
    ...secondaryCandidates.map((candidate) => ({
      kind: "progress" as const,
      source: candidate.source,
      href: candidate.href,
      title: candidate.title,
      business: candidate.business,
      businessLogoUrl: candidate.businessLogoUrl,
      remaining: candidate.remaining,
      total: candidate.total,
      current: candidate.current,
      mechanic: candidate.mechanic,
      ...(candidate.source === "loyalty"
        ? {
            businessId: candidate.businessId,
            businessArea: candidate.businessArea,
            businessHours: candidate.businessHours,
          }
        : {}),
      accentClass: candidate.accentClass,
    })),
  );

  const progressHeroes = heroes
    .filter((hero): hero is Extract<HeroResult, { kind: "progress" }> => hero.kind === "progress")
    .sort((a, b) => {
      const aOpen = a.businessHours ? isOpenNow(a.businessHours) !== false : true;
      const bOpen = b.businessHours ? isOpenNow(b.businessHours) !== false : true;
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      const progressDelta = b.current / b.total - a.current / a.total;
      if (progressDelta !== 0) return progressDelta;
      return a.remaining - b.remaining;
    })
    .slice(0, 4);
  return progressHeroes.length > 0 ? progressHeroes : [{ kind: "new-user" }];
}
