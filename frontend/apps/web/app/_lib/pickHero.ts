import type { CampaignVoucher, Campaign, LoyaltyCardView, LoyaltyVoucher } from "@jaqyn/api";
import { resolveAccent } from "../loyalty/_lib/wallet";

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
      urgencyLabel: string;
    }
  | {
      kind: "progress";
      source: "loyalty" | "campaign";
      href: string;
      title: string;
      business: string;
      remaining: number;
      total: number;
      current: number;
      /** wallet gradient accent class for the hero card background */
      accentClass: string;
    }
  | { kind: "new-user" };

export interface PickHeroInputs {
  campaignVouchers: CampaignVoucher[];
  loyaltyVouchers: LoyaltyVoucher[];
  /** Only joined cards are considered. Filter before passing or pass all — we filter internally. */
  loyaltyCards: LoyaltyCardView[];
  followed: Campaign[];
}

export function pickHero(inputs: PickHeroInputs, now: Date = new Date()): HeroResult {
  const { campaignVouchers, loyaltyVouchers, loyaltyCards, followed } = inputs;

  // --- Priority 1: expiring voucher ---

  // Campaign vouchers: backend sets `expiring_soon` flag directly.
  const expiringCampaign = campaignVouchers.find((v) => v.expiring_soon);
  if (expiringCampaign) {
    return {
      kind: "voucher",
      source: "campaign",
      href: "/campaign-wallet",
      title: expiringCampaign.reward_title,
      business: expiringCampaign.business.name,
      urgencyLabel: expiringCampaign.expires_label,
    };
  }

  // Loyalty vouchers: compute the 3-day window ourselves (no `expiring_soon` field).
  const nowMs = now.getTime();
  const expiringLoyalty = loyaltyVouchers.find((v) => {
    if (!v.expires_at) return false;
    const diff = new Date(v.expires_at).getTime() - nowMs;
    return diff >= 0 && diff <= EXPIRY_WINDOW_MS;
  });
  if (expiringLoyalty) {
    return {
      kind: "voucher",
      source: "loyalty",
      href: "/rewards",
      title: expiringLoyalty.reward_title,
      business: expiringLoyalty.business_name,
      // Raw ISO date portion; HeroCard formats it locale-aware (pure fn stays
      // locale-free).
      urgencyLabel: expiringLoyalty.expires_at!.slice(0, 10),
    };
  }

  // --- Priority 2: closest to reward ---

  type Candidate =
    | { source: "loyalty"; remaining: number; total: number; current: number; href: string; title: string; business: string; accentClass: string }
    | { source: "campaign"; remaining: number; total: number; current: number; href: string; title: string; business: string; accentClass: string };

  const candidates: Candidate[] = [];

  // Joined stamp/visit cards only (points cards excluded — no required_count goal).
  for (const card of loyaltyCards) {
    if (!card.joined) continue;
    if (card.required_count == null) continue; // points type — skip
    const current = card.type === "stamp" ? card.stamps_count : card.visits_count;
    const remaining = card.required_count - current;
    if (remaining < 1) continue; // already at goal or over
    candidates.push({
      source: "loyalty",
      remaining,
      total: card.required_count,
      current,
      href: `/loyalty/${card.program_id}`,
      title: card.reward_summary,
      business: card.business_name,
      // Use the card accent for the hero gradient.
      accentClass: `bg-wallet-${resolveAccent(card.business_id, card.business_card_accent)}`,
    });
  }

  // Followed campaigns with progress.
  for (const campaign of followed) {
    const p = campaign.my_progress;
    if (!p || p.target_count == null) continue;
    const remaining = p.target_count - p.current_count;
    if (remaining < 1) continue;
    candidates.push({
      source: "campaign",
      remaining,
      total: p.target_count,
      current: p.current_count,
      href: `/campaigns/${campaign.id}`,
      title: campaign.reward.title,
      business: campaign.business.name,
      accentClass: "bg-brand-gradient",
    });
  }

  if (candidates.length > 0) {
    // Sort: fewest remaining first; ties → loyalty before campaign.
    candidates.sort((a, b) => {
      if (a.remaining !== b.remaining) return a.remaining - b.remaining;
      // Tie-break: loyalty wins.
      if (a.source === "loyalty" && b.source !== "loyalty") return -1;
      if (b.source === "loyalty" && a.source !== "loyalty") return 1;
      return 0;
    });
    const best = candidates[0]!;
    return {
      kind: "progress",
      source: best.source,
      href: best.href,
      title: best.title,
      business: best.business,
      remaining: best.remaining,
      total: best.total,
      current: best.current,
      accentClass: best.accentClass,
    };
  }

  // --- Priority 3: new user ---
  return { kind: "new-user" };
}

