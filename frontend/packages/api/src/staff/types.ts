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

// ---- Campaign-aware scan (apps.campaigns — plan §1.3 / §3 staff surface) -----
// Staff scans the customer's personal QR; the result lists campaigns the visit
// is eligible to count toward, plus loyalty (plan D3). Then confirm a visit, or
// scan + redeem a campaign reward voucher.

// The loyalty form a row advances. Drives which chooser action and entry the
// staff sees: stamp/visit/points-visit-basis = one tap; points-spend-basis uses
// the bill-amount keypad; social = confirm a post.
export type ScanRowMechanic = "visit" | "stamp" | "points" | "social" | null;

export type CampaignScanRow = {
  campaign_id: string;
  name: string;
  // Sub-line: business + rule summary (e.g. "Manas Coffee · Visit 3× before 12:00").
  sub: string;
  // Owning business name, shown as the row's secondary line in the chooser.
  business_name: string;
  current_count: number;
  // Next count after this confirm (capped at goal).
  next_count: number;
  goal: number;
  eligible: boolean;
  // Why a campaign can't be counted right now (min-gap, daily cap, window…).
  reason: string | null;
  // ---- multi-form loyalty (backend scan-row contract) ----
  // The mechanic that decides the row's action + whether an amount is required.
  mechanic: ScanRowMechanic;
  // "individual" | "group" | "social" — the campaign family.
  campaign_type: string;
  // The reward unlocked on completion, for the success banner.
  reward_title: string | null;
  // Points the customer currently holds in this program (points mechanic).
  points_balance: number;
  // Points minted per som spent (spend-basis points). Decimal string; null when
  // the program awards a flat per-visit amount instead.
  points_per_som: string | null;
  // Flat points minted per visit (visit-basis points). null on spend-basis.
  points_per_visit: number | null;
  // Som returned per point when the customer redeems. Decimal string; combines
  // with points_per_som to compute the "% back" chip. null when not set.
  cashback_per_point: string | null;
  // Som spent so far toward a spend goal. Decimal string ("0" when none).
  current_spend: string;
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
  // Customer's points balance after the award (points mechanic). For a points
  // confirm this is the NEW balance; 0 for non-points programs.
  points_balance: number;
};

// One advanced-campaign leg (same shape as a confirm-visit outcome).
export type UnifiedCampaignLeg = ConfirmVisitResult;

// Confirming a SOCIAL proof returns the same ProgressResult shape as a visit
// confirm (campaign + voucher) — campaigns-restructure design §5.
export type ConfirmSocialResult = ConfirmVisitResult;

// A campaign that was a candidate this scan but was blocked (min-gap, etc).
export type SkippedCampaign = {
  campaign_id: string;
  name: string;
  reason_code: string;
};

// Unified scan: one staff confirm advances the campaign set (all stacking
// campaigns + one prioritized default). Post-restructure there is no separate
// loyalty leg — a loyalty card is now an INDIVIDUAL campaign and advances through
// `campaigns` like any other (campaigns-restructure design §5). The backend
// returns 200 even when no campaign advanced; skipped_campaigns carries reasons.
export type UnifiedScanResult = {
  customer: { name: string; phone: string };
  // Every campaign that advanced this scan (may be empty).
  campaigns: UnifiedCampaignLeg[];
  // Candidate campaigns that did not advance, with a reason each.
  skipped_campaigns: SkippedCampaign[];
};

// Read-only resolve of a scanned token → which preview the screen should open.
export type ScanDispatchResult =
  | { kind: "customer"; customer: ScanCustomerResult; voucher: null; reason: null }
  | { kind: "voucher"; customer: null; voucher: CampaignVoucherScanResult; reason: null }
  | { kind: "invalid"; customer: null; voucher: null; reason: string | null };

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
