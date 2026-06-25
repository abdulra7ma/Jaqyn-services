// Business-owner domain types (mirror backend business/loyalty/groups/reporting
// serializers). Kept in the API layer so dashboard screens stay decoupled.

export type BusinessStatus = "pending" | "approved" | "rejected" | "disabled";

export type OnboardingStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "changes_requested"
  | "completed";
export type VerificationStatus = "pending_verification" | "verified" | "rejected" | "suspended";
export type VisibilityStatus = "draft" | "hidden" | "published" | "unpublished";

export type BusinessProfile = {
  id: string;
  business_code: string;
  name: string;
  display_name?: string;
  legal_name?: string;
  category: string;
  business_type?: string;
  description: string | null;
  address: string;
  area: string;
  city?: string;
  country?: string;
  latitude: string | null;
  longitude: string | null;
  phone: string;
  public_email?: string | null;
  website_url?: string | null;
  instagram_url: string | null;
  // Brand image (logo) and background image (cover) URLs — relative `/media/...`
  // (served same-origin through the Next proxy) or null when unset. `*_set`
  // mirror the backend booleans (whether the owner has uploaded each image).
  logo_url?: string | null;
  cover_url?: string | null;
  logo_set?: boolean;
  cover_set?: boolean;
  glyph?: string;
  accent_color?: string;
  price_level?: string;
  tags?: string[];
  working_hours: Record<string, [string, string]> | null;
  menu_style?: string;
  default_currency?: string;
  default_language?: string;
  timezone?: string;
  status: BusinessStatus;
  onboarding_status?: OnboardingStatus;
  verification_status?: VerificationStatus;
  visibility_status?: VisibilityStatus;
  change_note?: string;
  completion_score?: number;
  missing_required_fields?: { label: string; step: number }[];
  created_at: string;
};

// ---- onboarding ----

export type BusinessType = {
  id: string;
  key: string;
  name: string;
  glyph: string;
  description: string;
  module: "menu" | "services" | "products" | "plans";
  sort_order: number;
};

export type OnboardingState = {
  business_id: string;
  onboarding_status: OnboardingStatus;
  verification_status: VerificationStatus;
  visibility_status: VisibilityStatus;
  completion_score: number;
  missing_required_fields: { label: string; step: number }[];
  change_note: string;
};

export type CatalogItem = {
  id: string;
  module: string;
  name: string;
  category: string;
  price: string;
  duration: string;
  sort_order: number;
  is_active: boolean;
  // Uploaded via POST /api/business/catalog-items/{id}/image/; null when unset.
  image_url: string | null;
};

// A single photo in the business gallery (cap 8, managed via /api/business/gallery/).
export type GalleryImage = {
  id: string;
  image_url: string;
  caption: string;
  sort_order: number;
};

export type CatalogItemPayload = {
  name: string;
  category?: string;
  price?: string;
  duration?: string;
  module?: string;
};

export type StaffInvite = {
  id: string;
  full_name: string;
  contact: string;
  role: "manager" | "staff" | "viewer";
  status: string;
  created_at: string;
};

export type StaffInvitePayload = { full_name?: string; contact: string; role: string };

export type StaffInviteList = { results: StaffInvite[]; limit: number; used: number };

// ---- Team / Manage Staff (GET /api/business/staff/) -------------------------
// A row is either a confirmed member (`kind:"member"`) or a pending invite
// (`kind:"invite"`). Member rows support role/suspend/reset/remove actions;
// invite rows support only cancel (delete) — mirrors the backend contract.

export type TeamMemberKind = "member" | "invite";
// Access role drives the Access level chips: cashier = "Scan & redeem",
// manager = "Full access".
export type TeamRole = "cashier" | "manager";
export type TeamStatus = "active" | "invited" | "suspended";

export type TeamMemberStats = {
  scans: number;
  redemptions: number;
  signups: number;
};

export type TeamRow = {
  id: string;
  kind: TeamMemberKind;
  name: string;
  role: TeamRole;
  access_label: string;
  email: string;
  phone: string;
  status: TeamStatus;
  last_active: string | null;
  joined: string;
  avatar_url: string | null;
  initials: string;
  stats: TeamMemberStats;
};

export type TeamCounts = {
  total: number;
  active: number;
  invited: number;
  suspended: number;
};

export type TeamList = {
  counts: TeamCounts;
  members: TeamRow[];
};

// Returned once by the reset-password action — shown to the owner to share
// securely. Never persisted client-side.
export type StaffPasswordReset = { temp_password: string };

export type ActivateResponse = {
  access: string;
  refresh: string;
  user: { id: string; name: string | null; email: string | null; role: string };
  business_id: string;
  next_step: string;
};

export type InviteValidation = {
  business_name: string;
  email: string | null;
  phone: string | null;
  expires_at: string;
};

export type OnboardingProfilePatch = Partial<{
  display_name: string;
  legal_name: string;
  description: string;
  phone: string;
  public_email: string;
  website_url: string;
  instagram_url: string;
  address: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
  business_type: string;
  menu_style: string;
  working_hours: Record<string, unknown>;
  default_currency: string;
  timezone: string;
  logo_set: boolean;
  cover_set: boolean;
  glyph: string;
  accent_color: string;
  price_level: string;
  tags: string[];
}>;

export type BusinessRegisterPayload = {
  name: string;
  category: string;
  address: string;
  area: string;
  phone: string;
  description?: string;
  instagram_url?: string;
};

export type DashboardMetrics = {
  scans: number;
  customers: number;
  rewards: number;
  total_scans: number;
  new_customers: number;
  returning_customers: number;
  rewards_issued: number;
  rewards_redeemed: number;
  active_groups: number;
  completed_groups: number;
  group_completion_rate: number;
  estimated_revenue: string;
};

export type Dashboard = {
  business: BusinessProfile;
  metrics: DashboardMetrics;
};

export type RewardProgramFull = {
  id: string;
  business_name?: string;
  type: string;
  title: string;
  description: string;
  required_count: number | null;
  required_spend?: string | null;
  reward_description: string;
  minimum_spend?: string | null;
  expiry_days: number | null;
  max_redemptions_per_customer?: number | null;
  /** Max reward vouchers a customer may hold at once (banking). Null = unlimited. */
  max_banked?: number | null;
  terms: string | null;
  is_active: boolean;
  enrolled?: number;
  redeemed_count?: number;
  created_at?: string;
};

export type RewardProgramPayload = {
  type: string;
  title: string;
  description: string;
  required_count?: number | null;
  required_spend?: string | null;
  reward_description: string;
  minimum_spend?: string | null;
  expiry_days?: number | null;
  max_redemptions_per_customer?: number | null;
  /** Max reward vouchers a customer may hold at once (banking). Null = unlimited. */
  max_banked?: number | null;
  terms?: string;
};

export type BusinessGroupDeal = {
  id: string;
  offer_title: string;
  leader_name: string | null;
  visit_time: string;
  status: string;
  target_size: number;
  joined: number;
  checked_in: number;
};

export type GroupOfferFull = {
  id: string;
  business_name?: string;
  title: string;
  description: string;
  category: string;
  min_group_size: number;
  max_group_size: number | null;
  reward_type: string;
  reward_description: string;
  valid_from: string;
  valid_to: string;
  valid_days: string[];
  time_start: string;
  time_end: string;
  checkin_window_minutes: number;
  requires_staff_code: boolean;
  requires_staff_approval: boolean;
  terms: string | null;
  status: string;
};

export type GroupOfferPayload = {
  title: string;
  description: string;
  category: string;
  min_group_size: number;
  max_group_size?: number | null;
  reward_type: string;
  reward_description: string;
  valid_from: string;
  valid_to: string;
  valid_days: string[];
  time_start: string;
  time_end: string;
  checkin_window_minutes?: number;
  requires_staff_code?: boolean;
  requires_staff_approval?: boolean;
  terms?: string;
};

export type MaskedCustomer = { id: string; phone: string; name: string | null };

export type ApprovalCode = { code: string; valid_from: string; valid_to: string };

export type MerchantQr = { token: string; type: string; url: string; png: string };

// ---- Campaigns (apps.campaigns — plan §1.3 business surface) -----------------
// Owner/manager view of campaigns: list KPIs + table, detail with controls and
// the Overview/Participants/Vouchers tabs (design business screens).

// Voucher lifecycle is shared with the customer surface — single source of truth.
import type { CampaignVoucherStatus } from "../customer/types";

export type BusinessCampaignType = "visit" | "timewindow" | "group";
export type BusinessCampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "ended"
  | "cancelled";

// Row in the campaigns list table (status / participants / completed / redeemed).
export type BusinessCampaignRow = {
  id: string;
  glyph: string;
  name: string;
  type: BusinessCampaignType;
  status: BusinessCampaignStatus;
  participants: number;
  completed: number;
  redeemed: number;
  ends_label: string;
};

// The four KPI cards above the table.
export type BusinessCampaignSummary = {
  active_campaigns: number;
  total_participants: number;
  rewards_issued: number;
  rewards_redeemed: number;
};

export type BusinessCampaignListResponse = {
  summary: BusinessCampaignSummary;
  campaigns: BusinessCampaignRow[];
};

// Per-campaign analytics for the Overview tab (plan analytics.py CampaignMetrics).
export type CampaignAnalytics = {
  views: number;
  joined: number;
  active: number;
  completed: number;
  issued: number;
  redeemed: number;
  redemption_rate: number;
  estimated_cost: string;
  cost_each: string;
};

export type BusinessCampaignReward = {
  type: string;
  title: string;
  description: string;
  expiry_days_after_unlock: number;
  max_redemptions: number | null;
  receiver?: string;
};

export type BusinessCampaignRule = {
  required_count: number | null;
  max_count_per_day: number | null;
  min_time_between: string | null;
  window_before_time: string | null;
  required_group_size: number | null;
  group_checkin_window: string | null;
};

export type BusinessCampaign = {
  id: string;
  glyph: string;
  name: string;
  description: string;
  type: BusinessCampaignType;
  status: BusinessCampaignStatus;
  start_label: string;
  end_label: string;
  active_days: string;
  active_hours: string;
  repeat_policy: "once" | "repeatable";
  max_participants: number | null;
  staff_approval_required: boolean;
  rule: BusinessCampaignRule;
  reward: BusinessCampaignReward;
  analytics: CampaignAnalytics;
};

export type CampaignParticipantRow = {
  id: string;
  name: string;
  progress: number;
  goal: number | null;
  status: "joined" | "in_progress" | "completed" | "redeemed";
  last_visit_label: string;
  reward_label: string;
};

export type CampaignVoucherRow = {
  id: string;
  code: string;
  customer: string;
  status: CampaignVoucherStatus;
  issued_label: string;
  expires_label: string;
  redeemed_by: string;
};

// Create/update payload — mirrors the 5-step wizard. Service is the authority;
// the wizard validates client-side (zod-style) only for UX (plan §2.4).
export type CampaignPayload = {
  type: BusinessCampaignType;
  name: string;
  description?: string;
  // Rules (subset relevant to the chosen type).
  required_count?: number | null;
  max_count_per_day?: number | null;
  min_time_between?: string | null;
  window_before_time?: string | null;
  required_group_size?: number | null;
  group_checkin_window?: string | null;
  start_at?: string;
  end_at?: string;
  active_days?: string;
  active_hours?: string;
  // Reward.
  reward_type?: string;
  reward_title?: string;
  reward_description?: string;
  expiry_days_after_unlock?: number;
  max_rewards?: number | null;
  // Limits.
  max_participants?: number | null;
  repeat_policy?: "once" | "repeatable";
  staff_approval_required?: boolean;
};

// Lifecycle transitions exposed as POST actions (plan §1.3).
export type CampaignLifecycleAction = "publish" | "pause" | "resume" | "end" | "cancel";

// ---- Social Post Studio (design SOCIAL POST STUDIO) -------------------------
// Server-composed, copy-ready post payload + the campaign image upload result.
// Validated with zod at the boundary (see ./adapters socialPostSchema).

export type SocialPlatform = "instagram" | "tiktok" | "facebook" | "whatsapp";

export type SocialPostCaptions = Record<SocialPlatform, string>;

export type CampaignSocialPost = {
  headline: string;
  reward_title: string;
  subtext: string;
  button_text: string;
  auto_join_url: string;
  image_url: string | null;
  captions: SocialPostCaptions;
  hashtags: string[];
};

// ---- Reports (apps.reporting BusinessReportSerializer) ----------------------
// Mirrors the typed BusinessReport dataclass. Values are display-ready strings
// from the server ("38%", "1,420 som", "—"); deltas are signed percentages or
// null when there is no prior-period baseline.

export type ReportPeriod = "today" | "week" | "month" | "custom";

export type ReportKpi = {
  key: string;
  value: string;
  delta_pct: number | null;
  hint: string;
};

export type ReportSeriesPoint = { label: string; value: number };

export type ReportStackedPoint = { label: string; new: number; returning: number };

export type ReportCohort = { label: string; count: number; pct: number };

export type ReportStaffRow = {
  id: string;
  name: string;
  role: string;
  scans: number;
  signups: number;
  redemptions: number;
  conversion_pct: number;
  trend_pct: number | null;
  top: boolean;
};

export type ReportTeamTotals = {
  scans: number;
  redemptions: number;
  signups: number;
  active_days: number;
};

export type ReportInsight = { icon: string; text: string };

export type BusinessReport = {
  period: ReportPeriod;
  range_label: string;
  kpis: ReportKpi[];
  scans_over_time: ReportSeriesPoint[];
  busiest_hours: ReportSeriesPoint[];
  new_vs_returning: ReportStackedPoint[];
  cohorts: ReportCohort[];
  staff: ReportStaffRow[];
  team_totals: ReportTeamTotals;
  insights: ReportInsight[];
};

export type ReportRange = { date_from: string; date_to: string };
