import type { LoyaltyCardView, LoyaltyProgramConfig, LoyaltyTier, LoyaltyVoucher, LoyaltyVoucherWallet } from "./types";

type Raw = Record<string, unknown>;
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const num = (value: unknown, fallback = 0) => typeof value === "number" ? value : Number(value ?? fallback) || fallback;
const nullableText = (value: unknown) => value == null ? null : text(value);
const nullableNum = (value: unknown): number | null => {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? null : n;
};

function adaptTiers(value: unknown): LoyaltyTier[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const tier = row as Raw;
    return { name: text(tier.name), min_visits: num(tier.min_visits), cashback_percent: text(tier.cashback_percent) };
  });
}

export function adaptLoyaltyCard(raw: Raw): LoyaltyCardView {
  const type = text(raw.type);
  const hours =
    raw.business_hours && typeof raw.business_hours === "object"
      ? (raw.business_hours as LoyaltyCardView["business_hours"])
      : {};
  return {
    program_id: text(raw.program_id), business_id: text(raw.business_id), business_name: text(raw.business_name),
    business_logo_url: nullableText(raw.business_logo_url), business_card_accent: text(raw.business_card_accent),
    // Geo coords added in campaigns redesign B (business_lat/business_lng from backend).
    business_lat: nullableNum(raw.business_lat),
    business_lng: nullableNum(raw.business_lng),
    type: type === "points" || type === "visit" ? type : "stamp",
    business_category: text(raw.business_category), business_area: text(raw.business_area), business_hours: hours,
    name: text(raw.name), reward_summary: text(raw.reward_summary), reward_expiry_days: num(raw.reward_expiry_days, 30),
    last_activity_at: nullableText(raw.last_activity_at), joined: Boolean(raw.joined),
    stamps_count: num(raw.stamps_count), visits_count: num(raw.visits_count),
    required_count: raw.required_count == null ? null : num(raw.required_count), points_balance: num(raw.points_balance),
    min_redeem_points: raw.min_redeem_points == null ? null : num(raw.min_redeem_points),
    points_per_som: nullableText(raw.points_per_som), cashback_per_point: nullableText(raw.cashback_per_point), pct_back: nullableText(raw.pct_back),
    tiers: adaptTiers(raw.tiers), current_tier_name: nullableText(raw.current_tier_name),
    next_tier_name: nullableText(raw.next_tier_name),
    next_tier_visits_left: raw.next_tier_visits_left == null ? null : num(raw.next_tier_visits_left),
  };
}

export function adaptLoyaltyVoucher(raw: Raw): LoyaltyVoucher {
  return raw as LoyaltyVoucher;
}

export function adaptLoyaltyWallet(raw: Raw): LoyaltyVoucherWallet {
  const list = (value: unknown) => Array.isArray(value) ? value.map((row) => adaptLoyaltyVoucher(row as Raw)) : [];
  return { active: list(raw.active), used: list(raw.used), expired: list(raw.expired) };
}

export function adaptLoyaltyProgram(raw: Raw): LoyaltyProgramConfig {
  return raw as LoyaltyProgramConfig;
}
