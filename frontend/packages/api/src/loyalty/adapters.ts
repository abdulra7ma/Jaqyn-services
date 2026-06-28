import type { LoyaltyCardView, LoyaltyProgramConfig, LoyaltyVoucher, LoyaltyVoucherWallet } from "./types";

type Raw = Record<string, unknown>;
const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const num = (value: unknown, fallback = 0) => typeof value === "number" ? value : Number(value ?? fallback) || fallback;
const nullableText = (value: unknown) => value == null ? null : text(value);

export function adaptLoyaltyCard(raw: Raw): LoyaltyCardView {
  const type = text(raw.type);
  return {
    program_id: text(raw.program_id), business_id: text(raw.business_id), business_name: text(raw.business_name),
    business_logo_url: nullableText(raw.business_logo_url), type: type === "points" || type === "visit" ? type : "stamp",
    name: text(raw.name), reward_summary: text(raw.reward_summary), joined: Boolean(raw.joined),
    stamps_count: num(raw.stamps_count), visits_count: num(raw.visits_count),
    required_count: raw.required_count == null ? null : num(raw.required_count), points_balance: num(raw.points_balance),
    points_per_som: nullableText(raw.points_per_som), cashback_per_point: nullableText(raw.cashback_per_point), pct_back: nullableText(raw.pct_back),
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
