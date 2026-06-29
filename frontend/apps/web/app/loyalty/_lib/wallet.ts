import type { LoyaltyCardView } from "@jaqyn/api";

/**
 * Wallet view-model + pure helpers for the physical card wallet (loyalty
 * redesign). One shop = one card; a shop's programs come from grouping the flat
 * `LoyaltyCardView[]` by `business_id`. Everything here is pure (no React) so it
 * is unit-tested directly.
 */

/** Named accent gradients defined in the Tailwind preset (`bg-wallet-*`). Order
 * is stable — `cardAccent` indexes into it by a hash of the business id, so a
 * shop keeps the same accent across renders. Keep in sync with
 * `backgroundImage` in `packages/config/tailwind-preset.js`. */
export const CARD_ACCENTS = [
  "terracotta",
  "amber",
  "sage",
  "plum",
  "indigo",
] as const;

export type CardAccent = (typeof CARD_ACCENTS)[number];

/** accent name → full preset gradient class. Static map (not interpolated) so
 * Tailwind's content scanner keeps every class. Used by the card face and the
 * detail sheet's featured band. */
export const ACCENT_BG: Record<CardAccent, string> = {
  terracotta: "bg-wallet-terracotta",
  amber: "bg-wallet-amber",
  sage: "bg-wallet-sage",
  plum: "bg-wallet-plum",
  indigo: "bg-wallet-indigo",
};

/** Progress visual for a single program face. `dots` for small stamp/visit
 * targets, `number` for points cashback, `bar` for large targets / spend. */
export type ProgressVisual =
  | { kind: "dots"; filled: number; total: number }
  | { kind: "number"; value: number }
  | { kind: "bar"; pct: number };

/** One shop's card in the wallet. `programs` is raw so the detail sheet can map
 * to the existing `BusinessLoyaltyCard` view; the face reads the derived fields. */
export type WalletShopCard = {
  businessId: string;
  businessName: string;
  businessLogoUrl: string | null;
  programs: LoyaltyCardView[];
  accent: CardAccent;
  ready: boolean;
};

/** Dots stop reading well past this many; larger targets fall back to a bar.
 * Matches `LoyaltyProgramBody`'s threshold so face and sheet agree. */
const MAX_DOTS = 14;

/** Current progress count for a program, by mechanic. */
function progressCount(p: LoyaltyCardView): number {
  return p.type === "stamp" ? p.stamps_count : p.visits_count;
}

/** A cashback card: a `points`-type program that pays back a som balance
 * (a cashback rate or pct-back is set). The customer spends the balance, so —
 * unlike a plain points accrual — it can be "ready" to use. */
export function isCashback(p: LoyaltyCardView): boolean {
  return p.type === "points" && (p.cashback_per_point != null || p.pct_back != null);
}

/**
 * Whether a program's reward is claimable — drives the wallet's pulsing 🎁
 * "Ready" badge + glow ring.
 *
 * - `stamp` / `visit`: ready once the count reaches the required target.
 * - cashback (`points` with a cashback rate): ready when there's a spendable
 *   balance (`points_balance > 0`). The card view has no `min_redeem` field, so
 *   any positive balance counts. ponytail: threshold on balance>0; tighten to
 *   min_redeem if the API ever exposes it.
 * - plain `points` (no cashback rate): always `false` — staff-operated accrual,
 *   never customer-claimable in the wallet.
 */
export function programReady(p: LoyaltyCardView): boolean {
  if (p.type === "points") return isCashback(p) && p.points_balance > 0;
  return p.required_count != null && progressCount(p) >= p.required_count;
}

/**
 * Compact progress visual for a card face.
 *
 * - `points` → `number`: cashback in som (`cashback_per_point × balance`) when a
 *   rate is set, else the raw points balance. Display only; backend is
 *   authoritative.
 * - `stamp` / `visit` with a small target → `dots` (filled vs total).
 * - everything else (no target, or target > MAX_DOTS) → `bar` (percent).
 */
export function progViz(p: LoyaltyCardView): ProgressVisual {
  if (p.type === "points") {
    const value = p.cashback_per_point
      ? Math.round(Number(p.cashback_per_point) * p.points_balance)
      : p.points_balance;
    return { kind: "number", value };
  }
  const total = p.required_count ?? 0;
  const filled = Math.max(0, Math.min(progressCount(p), total || progressCount(p)));
  if (total > 0 && total <= MAX_DOTS) return { kind: "dots", filled, total };
  const pct = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0;
  return { kind: "bar", pct };
}

/** Deterministic accent for a shop. Stable hash of the business id → one of the
 * five preset gradients, so a shop always wears the same color. */
export function cardAccent(businessId: string): CardAccent {
  let hash = 0;
  for (let i = 0; i < businessId.length; i += 1) {
    // djb2-ish: cheap, well-spread, deterministic. >>>0 keeps it unsigned.
    hash = (hash * 31 + businessId.charCodeAt(i)) >>> 0;
  }
  return CARD_ACCENTS[hash % CARD_ACCENTS.length]!;
}

/** Group the flat card list into one `WalletShopCard` per business, preserving
 * first-seen order. Each shop gets a derived accent and a `ready` flag. */
export function buildWallet(cards: LoyaltyCardView[]): WalletShopCard[] {
  const byBiz = new Map<string, WalletShopCard>();
  for (const card of cards) {
    const existing = byBiz.get(card.business_id);
    if (existing) {
      existing.programs.push(card);
      existing.ready = existing.ready || programReady(card);
    } else {
      byBiz.set(card.business_id, {
        businessId: card.business_id,
        businessName: card.business_name,
        businessLogoUrl: card.business_logo_url,
        programs: [card],
        accent: cardAccent(card.business_id),
        ready: programReady(card),
      });
    }
  }
  return [...byBiz.values()];
}
