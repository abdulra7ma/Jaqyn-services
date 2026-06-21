// Staff (cashier) domain types — mirror backend staff/qr/groups serializers.

export type StaffInfo = {
  id: string;
  name: string;
  role: "cashier" | "manager";
  business: string;
};

export type StaffLoginResult = {
  access: string;
  refresh: string;
  staff: StaffInfo;
};

export type TodayCode = { code: string; valid_from: string; valid_to: string };

export type ScanResult = {
  type: string;
  business: string | null;
  redemption?: { id: string; code: string; status: string; expires_at: string | null };
  group?: string;
};

export type StaffRedemption = {
  id: string;
  code: string;
  status: string;
  expires_at: string | null;
};

export type ScanLogRow = {
  id: string;
  action: string;
  status: string;
  failure_reason: string | null;
  created_at: string;
};

export type RecentActivity = {
  scans: ScanLogRow[];
  redemptions: { id: string; code: string; status: string; created_at: string }[];
};

export type StaffGroupMember = {
  id: string;
  customer: string;
  customer_name?: string;
  status: string;
  checked_in_at: string | null;
};

export type StaffGroup = {
  id: string;
  invite_token: string;
  visit_time: string;
  status: string;
  reward_code: string | null;
  group_offer: { id: string; title: string; business_name?: string; min_group_size: number };
  members: StaffGroupMember[];
};

export type StaffProgram = {
  id: string;
  type: "stamp" | "spend" | string;
  title: string;
  required_count: number | null;
  required_spend: string | null;
  reward_description: string;
};

export type StaffCollectState =
  | "awarded"
  | "needs_amount"
  | "already_counted"
  | "reward_ready";

export type StaffCollectResult = {
  state: StaffCollectState;
  customer: { name: string };
  program: {
    id: string;
    type: string;
    title: string;
    required_count: number | null;
    required_spend: string | null;
  };
  progress: {
    current_count: number;
    target_count: number | null;
    current_spend: string;
    required_spend: string | null;
    status: string;
  } | null;
  reward: { title: string; reward_description: string } | null;
  redemption: { id: string; code: string } | null;
  /** Number of reward vouchers minted this scan (only present on `awarded` state). */
  rewards_earned?: number;
  /** True when the customer's bank is full and no new voucher was minted (only present on `awarded` state). */
  bank_full?: boolean;
};
