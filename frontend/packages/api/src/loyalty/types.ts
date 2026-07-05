export type LoyaltyType = "points" | "stamp" | "visit";
export type LoyaltyStatus = "active" | "paused" | "archived";

export type LoyaltyCardView = {
  program_id: string;
  business_id: string;
  business_name: string;
  business_logo_url: string | null;
  /** Owner-chosen wallet-card gradient name; "" = auto (hashed from id). */
  business_card_accent: string;
  business_category: string;
  business_area: string;
  /** Day-of-week → [open, close] (e.g. {"mon":["07:00","21:00"]}); may be empty. */
  business_hours: Record<string, [string, string]>;
  // Geo coords for distance labels (campaigns redesign B — LoyaltyCardSerializer ext).
  // Null until the backend exposes Business.latitude/longitude on cards.
  business_lat: number | null;
  business_lng: number | null;
  type: LoyaltyType;
  name: string;
  reward_summary: string;
  reward_expiry_days: number;
  last_activity_at?: string | null;
  joined: boolean;
  stamps_count: number;
  visits_count: number;
  required_count: number | null;
  points_balance: number;
  min_redeem_points: number | null;
  points_per_som: string | null;
  cashback_per_point: string | null;
  pct_back: string | null;
};

export type LoyaltyTransaction = {
  id: string;
  kind: "earn" | "redeem" | "adjust" | "reverse";
  points_delta: number | null;
  stamps_delta: number | null;
  bill_amount: string | null;
  staff_name: string | null;
  customer_name: string | null;
  created_at: string;
};

export type LoyaltyProgramDetail = LoyaltyCardView & { history: LoyaltyTransaction[] };

export type LoyaltyCatalogItem = { id: string; name: string; price: string; image?: string | null };

export type LoyaltyVoucher = {
  id: string;
  program: string;
  program_name: string;
  business: string;
  business_name: string;
  voucher_code: string;
  status: "active" | "redeemed" | "expired" | "cancelled";
  reward_type: "free_item" | "discount" | "upgrade" | "cashback";
  reward_title: string;
  cashback_amount: string | null;
  catalog_item: string | null;
  catalog_item_name: string | null;
  qr_token: string | null;
  issued_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
};

export type LoyaltyVoucherWallet = {
  active: LoyaltyVoucher[];
  used: LoyaltyVoucher[];
  expired: LoyaltyVoucher[];
};

export type LoyaltyHomeSummary = {
  visit_streak_days: number;
  // Consecutive ISO-weeks with ≥1 visit (campaigns redesign B — home-summary ext).
  visit_streak_weeks: number;
  streak_active_today: boolean;
  featured_campaign_ids: string[];
  rewards_earned: number;
  som_saved: string;
  active_cards: number;
};

export type LoyaltyScanRow = {
  program_id: string;
  name: string;
  type: LoyaltyType;
  reward_title: string;
  stamps_count: number;
  visits_count: number;
  required_count: number | null;
  points_balance: number;
  points_per_som: string | null;
  points_per_visit: number | null;
  cashback_per_point: string | null;
  pct_back: string | null;
  current_spend: string;
  needs_amount: boolean;
};

export type LoyaltyProgramConfig = {
  id: string;
  type: LoyaltyType;
  status: LoyaltyStatus;
  name: string;
  description: string;
  reward_summary: string;
  points_basis?: "visit" | "spend" | null;
  points_per_visit?: number | null;
  points_per_som?: string | null;
  cashback_per_point?: string | null;
  min_redeem_points?: number | null;
  required_count?: number | null;
  max_banked?: number | null;
  reward_type?: string | null;
  reward_title?: string;
  reward_description?: string;
  reward_expiry_days?: number;
  item_selection?: "fixed" | "customer" | null;
  catalog_item_id?: string | null;
  members?: number;
  outstanding?: number;
  redeemed?: number;
};

export type LoyaltyProgramInput = Omit<LoyaltyProgramConfig, "id" | "status" | "reward_summary" | "members" | "outstanding" | "redeemed">;

export type LoyaltyProgramVoucherRow = {
  voucher_code: string;
  customer_name: string;
  status: "active" | "redeemed" | "expired" | "cancelled";
  reward_title: string;
  issued_at: string;
};

export type BusinessLoyaltyProgramDetail = LoyaltyProgramConfig & {
  members: Array<{ customer_name: string; state: Record<string, number>; joined_at: string }>;
  transactions: LoyaltyTransaction[];
  vouchers: LoyaltyProgramVoucherRow[];
  analytics: {
    members: number;
    outstanding: number;
    redeemed: number;
    new_members_30d: number;
    repeat_rate: number;
    avg_basket: number;
    redemptions_7d: number[];
  };
  settings: LoyaltyProgramConfig;
};

export type UnifiedStaffScan =
  | { kind: "customer"; customer: { name: string; phone_masked: string }; loyalty: LoyaltyScanRow[]; campaigns: Array<{ campaign_id: string; name: string; eligible: boolean; reason_code: string | null; progress_count: number; required_count: number; mechanic: "visit" }> }
  | { kind: "voucher"; domain: "loyalty" | "campaign"; voucher: unknown }
  | { kind: "group"; group_id: string | null }
  | { kind: "invalid"; reason_code: string };
