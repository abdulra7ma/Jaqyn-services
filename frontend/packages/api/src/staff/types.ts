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

// ---- Campaign-aware scan (apps.campaigns — plan §1.3 / §3 staff surface) -----
// Staff scans the customer's personal QR; the result lists campaigns the visit
// is eligible to count toward, plus loyalty (plan D3). Then confirm a visit, or
// scan + redeem a campaign reward voucher.

export type CampaignScanRow = {
  campaign_id: string;
  name: string;
  // Sub-line: business + rule summary (e.g. "Manas Coffee · Visit 3× before 12:00").
  sub: string;
  current_count: number;
  // Next count after this confirm (capped at goal).
  next_count: number;
  goal: number;
  eligible: boolean;
  // Why a campaign can't be counted right now (min-gap, daily cap, window…).
  reason: string | null;
};

export type ScanCustomerResult = {
  customer: { id: string; name: string; phone: string };
  rows: CampaignScanRow[];
  // True when nothing the customer joined is countable right now.
  none_eligible: boolean;
};

// Outcome of confirming a visit toward one campaign.
export type ConfirmVisitResult = {
  state: "counted" | "completed";
  customer_name: string;
  campaign_name: string;
  current_count: number;
  goal: number;
  // Present on `completed`: the issued voucher's reward + expiry.
  reward_title: string | null;
  expires_label: string | null;
};

export type CampaignVoucherScanState = "valid" | "redeemed" | "expired" | "cancelled" | "not_found";

// Result of scanning a campaign reward voucher QR.
export type CampaignVoucherScanResult = {
  state: CampaignVoucherScanState;
  voucher_id: string | null;
  customer_name: string | null;
  campaign_name: string | null;
  reward_title: string | null;
  expires_label: string | null;
  code: string | null;
  // Human-readable reason when state is not `valid`.
  reason: string | null;
  // Present when the scanned token is a group check-in QR rather than a single
  // voucher: redeem then routes to the group-confirm sheet (leader gets the
  // voucher — plan Q4). null for ordinary single-customer vouchers.
  group: GroupVoucherScan | null;
};

// Group session surfaced by a voucher scan in Redeem-reward mode. Confirming it
// issues one voucher to the leader (plan Q4).
export type GroupVoucherScan = {
  group_session_id: string;
  campaign_name: string;
  business_name: string;
  // e.g. "4 / 4" — members checked in vs. required.
  checked_in_label: string;
};

export type RedeemCampaignVoucherResult = {
  voucher_id: string;
  reward_title: string;
  customer_name: string;
};

// Result of confirming a full group session (leader gets the voucher — plan Q4).
export type ConfirmGroupResult = {
  campaign_name: string;
  reward_title: string;
  expires_label: string;
  leader_name: string;
};
