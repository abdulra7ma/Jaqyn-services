import type { Campaign, LoyaltyCardView } from "@jaqyn/api";

/**
 * Priority logic for the campaigns-tab vessel hero. Pure — no React, no side effects.
 * Inject `now` for deterministic testing.
 *
 * Priority (campaigns redesign spec):
 *   1. Skip cards that already have a claimable voucher (they appear in the
 *      claimable banner above; exclude them here to avoid duplication).
 *   2. Among remaining candidates, pick the one with the lowest
 *      remaining/total ratio (closest to completion as a fraction).
 *      Ties: loyalty cards before campaigns (loyalty is the primary earning surface).
 *   3. If nothing qualifies → "empty" (no-card state).
 *
 * Group campaigns surface as a separate variant in the result union so the
 * VesselHero component can render seats rather than a stamp cup.
 */

export type CampaignsHeroResult =
  | {
      kind: "loyalty";
      card: LoyaltyCardView;
      /** Steps already done (stamps or visits). */
      current: number;
      /** Steps required in total. */
      total: number;
      /** Steps still needed. */
      remaining: number;
      /** Fraction 0–1 of completion. */
      ratio: number;
    }
  | {
      kind: "campaign";
      campaign: Campaign;
      current: number;
      total: number;
      remaining: number;
      ratio: number;
    }
  | {
      kind: "group";
      campaign: Campaign;
      /** Members already joined. */
      joined: number;
      /** Required group size. */
      required: number;
    }
  | { kind: "empty" };

export interface PickCampaignsHeroInputs {
  /** Joined loyalty cards. Filter before passing, or pass all — we filter internally. */
  loyaltyCards: LoyaltyCardView[];
  /** Followed (in-progress) campaigns with my_progress populated. */
  followed: Campaign[];
  /**
   * Set of campaign/program ids that already have an active (claimable) voucher.
   * Cards/campaigns in this set are excluded from hero selection (they appear
   * in the claimable banner above the hero).
   */
  claimableIds?: Set<string>;
}

export function pickCampaignsHero(
  inputs: PickCampaignsHeroInputs,
  // `now` is reserved for future time-of-day logic (e.g. "open now" context)
  // and injected by tests for determinism. Prefixed _ to satisfy no-unused-vars.
  _now: Date = new Date(), // eslint-disable-line no-underscore-dangle
): CampaignsHeroResult {
  const { loyaltyCards, followed, claimableIds = new Set<string>() } = inputs;

  type RatioCandidate =
    | { kind: "loyalty"; card: LoyaltyCardView; current: number; total: number; remaining: number; ratio: number }
    | { kind: "campaign"; campaign: Campaign; current: number; total: number; remaining: number; ratio: number };

  const candidates: RatioCandidate[] = [];

  // --- Group campaigns: surface the first active group campaign with open seats.
  // Groups are rendered in a dedicated "seats" variant and take highest priority
  // after claimable exclusion — the user has explicitly joined a group, so it's
  // the most actionable thing on screen.
  for (const campaign of followed) {
    if (campaign.campaign_type !== "group") continue;
    const p = campaign.my_progress;
    if (!p || p.completed) continue;
    const required = campaign.rule.required_group_size;
    if (required == null) continue;
    // We don't have per-group joined count here — use progress as proxy.
    // The full group detail is on MyGroup; here we just surface that a group exists.
    return {
      kind: "group",
      campaign,
      joined: p.current_count,
      required,
    };
  }

  // --- Loyalty cards (stamp / visit only; points excluded — no discrete goal). ---
  for (const card of loyaltyCards) {
    if (!card.joined) continue;
    if (card.type !== "stamp" && card.type !== "visit") continue;
    if (card.required_count == null) continue;
    // Skip if already claimable (voucher exists for this program).
    if (claimableIds.has(card.program_id)) continue;
    const current = card.type === "stamp" ? card.stamps_count : card.visits_count;
    const remaining = card.required_count - current;
    if (remaining < 1) continue; // already at or past goal
    const ratio = remaining / card.required_count;
    candidates.push({ kind: "loyalty", card, current, total: card.required_count, remaining, ratio });
  }

  // --- Individual campaigns with progress. ---
  for (const campaign of followed) {
    if (campaign.campaign_type !== "individual") continue;
    const p = campaign.my_progress;
    if (!p || p.target_count == null) continue;
    if (p.completed) continue;
    if (claimableIds.has(campaign.id)) continue;
    const remaining = p.target_count - p.current_count;
    if (remaining < 1) continue;
    const ratio = remaining / p.target_count;
    candidates.push({ kind: "campaign", campaign, current: p.current_count, total: p.target_count, remaining, ratio });
  }

  if (candidates.length === 0) return { kind: "empty" };

  // Sort by ratio ascending (closest to completion first).
  // On a tie: loyalty beats campaign (loyalty is the primary earning surface).
  candidates.sort((a, b) => {
    if (a.ratio !== b.ratio) return a.ratio - b.ratio;
    if (a.kind === "loyalty" && b.kind !== "loyalty") return -1;
    if (b.kind === "loyalty" && a.kind !== "loyalty") return 1;
    return 0;
  });

  // candidates is non-empty (checked above) so [0] is defined.
  const winner = candidates[0] as NonNullable<typeof candidates[0]>;

  if (winner.kind === "loyalty") {
    return {
      kind: "loyalty",
      card: winner.card,
      current: winner.current,
      total: winner.total,
      remaining: winner.remaining,
      ratio: winner.ratio,
    };
  }
  // winner.kind === "campaign" (only two union members in RatioCandidate).
  return {
    kind: "campaign",
    campaign: winner.campaign,
    current: winner.current,
    total: winner.total,
    remaining: winner.remaining,
    ratio: winner.ratio,
  };
}
