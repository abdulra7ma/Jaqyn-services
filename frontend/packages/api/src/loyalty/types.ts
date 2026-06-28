export type LoyaltyType = "points" | "stamp" | "visit";
export type LoyaltyStatus = "active" | "paused" | "archived";

export type LoyaltyCardView = {
  program_id: string;
  business_id: string;
  business_name: string;
  business_logo_url: string | null;
  type: LoyaltyType;
  name: string;
  reward_summary: string;
  joined: boolean;
  stamps_count: number;
  visits_count: number;
  required_count: number | null;
  points_balance: number;
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

export type BusinessLoyaltyProgramDetail = LoyaltyProgramConfig & {
  overview: Record<string, number>;
  members: Array<{ customer_name: string; state: Record<string, number>; joined_at: string }>;
  transactions: LoyaltyTransaction[];
  analytics: { stat_a: number; stat_b: number; stat_c: number };
  settings: LoyaltyProgramConfig;
};

export type UnifiedStaffScan =
  | { kind: "customer"; customer: { name: string; phone_masked: string }; loyalty: LoyaltyScanRow[]; campaigns: Array<{ campaign_id: string; name: string; eligible: boolean; reason_code: string | null; progress_count: number; required_count: number; mechanic: "visit" }> }
  | { kind: "voucher"; domain: "loyalty" | "campaign"; voucher: unknown }
  | { kind: "group"; group_id: string | null }
  | { kind: "invalid"; reason_code: string };
