// Customer-facing domain types. Mirror tasks/_shared/SCHEMAS.md (only the fields
// the customer screens render). Kept in the API layer so screens stay decoupled
// from transport + backend shape.

import type { GalleryImage } from "../business/types";

export type Role = "customer" | "business_owner" | "staff" | "admin";
export type Language = "ru" | "en" | "ky";

export type User = {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  role: Role;
  is_phone_verified: boolean;
  is_email_verified: boolean;
  avatar: string | null;
  avatar_emoji: string;
};

export type CustomerProfile = {
  birthday: string | null;
  language: Language;
  marketing_opt_in: boolean;
  onboarding_completed: boolean;
};

// App area a user lands in after login (backend resolves: owner > staff > customer).
export type Area = "customer" | "staff" | "business";

export type StaffMembership = {
  id: string;
  name: string;
  role: "cashier" | "manager";
  business_id: string;
  business_name: string;
};

export type Me = {
  user: User;
  area: Area;
  limits?: { max_active_groups: number };
  profile: CustomerProfile | null;
  business?: { id: string; name: string; status: string };
  staff?: StaffMembership;
};

export type BusinessCategory =
  | "cafe"
  | "restaurant"
  | "barber"
  | "beauty"
  | "retail"
  | "bakery"
  | "other";

/** A selectable business category as served by GET /api/businesses/categories/. */
export type CategoryOption = {
  value: BusinessCategory;
  label: string;
};

export type Business = {
  id: string;
  name: string;
  category: BusinessCategory;
  description: string | null;
  address: string;
  area: string;
  latitude?: string | null;
  longitude?: string | null;
  phone: string;
  public_email?: string | null;
  website_url?: string | null;
  instagram_url: string | null;
  logo_url: string | null;
  cover_url: string | null;
  glyph?: string;
  accent_color?: string;
  price_level?: string;
  tags?: string[];
  working_hours: Record<string, [string, string]> | null;
  distance_km?: number | null;
  reward?: string | null;
  rewards?: RewardProgram[];
  group_offers?: PublicGroupOffer[];
  catalog_sections?: CatalogSection[];
  // Multi-photo gallery (cap 8). Present on the public business detail endpoint.
  gallery?: GalleryImage[];
};

export type PublicCatalogItem = {
  id: string;
  module: string;
  name: string;
  category: string;
  price: string;
  duration: string;
  // Populated when the business owner has uploaded a catalog item image.
  image_url: string | null;
};

export type CatalogSection = {
  title: string;
  items: PublicCatalogItem[];
};

export type RewardProgramType =
  | "stamp"
  | "visit"
  | "spend"
  | "coupon"
  | "welcome"
  | "birthday";

export type RewardProgram = {
  id: string;
  type: RewardProgramType;
  title: string;
  description: string;
  required_count: number | null;
  reward_description: string;
  terms: string | null;
};

export type RewardProgressStatus = "active" | "unlocked" | "redeemed" | "expired";

export type RewardProgress = {
  id: string;
  business: Pick<Business, "id" | "name" | "category" | "logo_url" | "area">;
  reward_program: RewardProgram;
  current_count: number;
  target_count: number | null;
  status: RewardProgressStatus;
  unlocked_at: string | null;
  expires_at: string | null;
};

export type RedemptionStatus = "pending" | "redeemed" | "expired" | "cancelled";

export type Redemption = {
  id: string;
  code: string;
  status: RedemptionStatus;
  presented_at: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  present_expires_at?: string;
  reward_title?: string;
  reward_description?: string;
  business_name?: string;
  created_at?: string;
};

export type WalletReward = {
  business: { id: string; name: string };
  reward: { id: string; title: string; description: string };
  count: number;
  soonest_expiry: string | null;
  redemption_ids: string[];
};

export type Wallet = {
  available: WalletReward[];
  in_progress: RewardProgress[];
};

export type BusinessRewardCard = {
  business: { id: string; name: string; area: string };
  programs: Array<{
    id: string;
    type: string;
    title: string;
    reward_description: string;
    current_count: number;
    target_count: number | null;
    current_spend: string;
    required_spend: string | null;
    completed_count: number;
    available_count: number;
    bank_full: boolean;
  }>;
  available: Array<{
    id: string;
    reward_title: string;
    reward_description: string;
    expires_at: string | null;
    created_at: string;
  }>;
  history: Array<{
    id: string;
    reward_title: string;
    status: string;
    redeemed_at: string | null;
    created_at: string;
  }>;
};

// ---- QR resolve ----
export type QrTokenType =
  | "merchant_collect"
  | "customer_profile"
  | "reward_redeem"
  | "group_invite"
  | "group_checkin"
  | "group_reward"
  | "campaign";

export type QrResolve = {
  token: string;
  type: QrTokenType;
  business: Business | null;
  reward_program: RewardProgram | null;
  progress: RewardProgress | null;
};

// ---- Groups ----
export type GroupRewardType =
  | "free_shared_item"
  | "group_discount"
  | "leader_reward"
  | "buy_x_get_y"
  | "friend_booking"
  | "custom";

export type GroupOffer = {
  id: string;
  business: Pick<Business, "id" | "name" | "category" | "area" | "logo_url">;
  title: string;
  description: string;
  reward_type: GroupRewardType;
  reward_description: string;
  min_group_size: number;
  max_group_size: number | null;
  valid_from: string;
  valid_to: string;
  time_start: string;
  time_end: string;
  checkin_window_minutes: number;
  requires_staff_code: boolean;
  terms: string | null;
  status: "draft" | "pending_approval" | "active" | "paused" | "expired" | "rejected";
};

export type PublicGroupOffer = Pick<
  GroupOffer,
  | "id"
  | "title"
  | "description"
  | "reward_type"
  | "reward_description"
  | "min_group_size"
  | "max_group_size"
  | "time_start"
  | "time_end"
  | "terms"
  | "status"
>;

export type GroupMemberStatus = "joined" | "checked_in" | "left" | "no_show" | "removed";

export type GroupMember = {
  id: string;
  name: string;
  status: GroupMemberStatus;
  is_leader: boolean;
};

export type GroupDealStatus =
  | "forming"
  | "full"
  | "scheduled"
  | "checking_in"
  | "completed"
  | "expired"
  | "cancelled"
  | "failed";

export type GroupDeal = {
  id: string;
  invite_token: string;
  group_offer: GroupOffer;
  visit_time: string;
  status: GroupDealStatus;
  reward_code: string | null;
  members: GroupMember[];
  is_member: boolean;
  is_leader: boolean;
  checked_in: boolean;
};

// ---- Campaigns (apps.campaigns — plan §2.1 / §3) -----------------------------
// Temporary, dated challenges: complete a challenge → unlock a voucher → redeem.
// Three types ship in MVP (plan D7): VISIT, TIME_WINDOW, GROUP. Mirrors only the
// fields the campaign screens render; the API layer is the boundary, so raw
// backend rows are coerced through ./adapters before reaching these types.

export type CampaignType = "visit" | "timewindow" | "group";

// Lifecycle states (plan §1.1 Campaign.status). DRAFT/SCHEDULED/PAUSED are
// business-side; customers mostly see ACTIVE/ENDED/CANCELLED.
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "ended"
  | "cancelled";

// Repeat policy (plan §1.1 completion_limit_per_customer).
export type CampaignRepeatPolicy = "once" | "repeatable";

export type CampaignRewardType = "free_item" | "discount" | "upgrade" | "custom";

// Group-only: who receives the voucher. MVP issues to the leader (plan Q4).
export type CampaignRewardReceiver = "leader" | "every_member" | "table";

export type CampaignRule = {
  // VISIT / TIME_WINDOW: number of verified visits required.
  required_count: number | null;
  // VISIT: cap on visits counted per calendar day.
  max_count_per_day: number | null;
  // VISIT: human-readable minimum gap between counted visits (e.g. "4 hours").
  min_time_between: string | null;
  // TIME_WINDOW: visits only count before this wall-clock time (e.g. "12:00").
  window_before_time: string | null;
  // GROUP: required group size and the check-in window (e.g. "15 min").
  required_group_size: number | null;
  group_checkin_window: string | null;
};

export type CampaignReward = {
  type: CampaignRewardType;
  title: string;
  description: string;
  // Days the voucher stays valid after it is unlocked (plan §1.1).
  expiry_days_after_unlock: number;
  max_redemptions: number | null;
  receiver?: CampaignRewardReceiver;
};

// The viewer's own enrolment + progress for a campaign. Null when not joined.
export type CampaignProgress = {
  joined: boolean;
  status: "joined" | "in_progress" | "completed" | "redeemed" | null;
  current_count: number;
  target_count: number | null;
  completed: boolean;
  // Voucher id once the campaign is completed (links to the wallet view).
  voucher_id: string | null;
};

export type Campaign = {
  id: string;
  business: Pick<Business, "id" | "name" | "category" | "logo_url" | "area">;
  glyph: string;
  name: string;
  description: string;
  // Short marketing line shown on the discover card.
  blurb: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  // Human-readable dates as the design renders them (e.g. "1 Jul").
  start_label: string;
  end_label: string;
  days_left: number;
  active_days: string;
  active_hours: string;
  repeat_policy: CampaignRepeatPolicy;
  max_participants: number | null;
  rule: CampaignRule;
  reward: CampaignReward;
  // Present on customer detail/discover responses; absent on business lists.
  my_progress: CampaignProgress | null;
  // Auto-join acquisition link (plan D9) — e.g. "jaqyn.kg/c/<token>".
  auto_join_link?: string | null;
};

export type CampaignVoucherStatus = "active" | "redeemed" | "expired" | "cancelled";

export type CampaignVoucher = {
  id: string;
  code: string;
  status: CampaignVoucherStatus;
  glyph: string;
  business: Pick<Business, "id" | "name">;
  campaign: { id: string; name: string };
  reward_title: string;
  reward_description: string;
  // The QR payload the customer presents; type CAMPAIGN_REWARD (plan D2/D4).
  qr_token: string;
  issued_label: string;
  expires_label: string;
  // True when the voucher is close to expiry (drives the amber pill).
  expiring_soon: boolean;
  // Populated only once redeemed.
  redeemed_at_label: string | null;
  redeemed_by: string | null;
  redeemed_branch: string | null;
};

// Wallet groups vouchers by lifecycle for the three design sections.
export type CampaignWallet = {
  active: CampaignVoucher[];
  used: CampaignVoucher[];
  expired: CampaignVoucher[];
};

export type GroupSessionStatus = "forming" | "full" | "checked_in" | "completed" | "expired";

export type GroupSessionMember = {
  id: string;
  name: string;
  initial: string;
  is_leader: boolean;
  is_you: boolean;
  checked_in: boolean;
};

export type GroupSession = {
  id: string;
  campaign: { id: string; name: string; glyph: string };
  invite_code: string;
  status: GroupSessionStatus;
  required_size: number;
  joined_count: number;
  members: GroupSessionMember[];
  // QR payload shown to staff once the group is full (type GROUP_CHECKIN).
  checkin_token: string | null;
};

export type RequestEmailOtpPayload = {
  email: string;
  name: string;
  password: string;
  phone?: string;
};

export type EmailOtpResult = AuthResult;

// ---- request payloads ----
export type CustomerQr = { token: string; type: string; url: string; png: string };
export type NearbyParams = Partial<{
  search: string;
  category: string;
  area: string;
  lat: number;
  lng: number;
  radius_km: number;
  limit: number;
}>;

// Filters for the customer campaigns list. `type` mirrors the backend
// campaign_type enum (underscored "time_window"); `joined=true` restricts to
// the viewer's own enrolled / in-progress campaigns.
export type CampaignListParams = Partial<{
  type: "visit" | "time_window" | "group";
  joined: boolean;
}>;

export type RequestOtpResult = { request_id: string; expires_in: number };
export type AuthResult = {
  access: string;
  refresh: string;
  user: User;
  area: Area;
  is_new?: boolean;
  onboarding_completed?: boolean;
};
export type VerifyOtpResult = AuthResult;
export type PasswordLoginResult = AuthResult;
export type ProfilePatch = Partial<{
  name: string;
  email: string;
  birthday: string;
  language: Language;
  marketing_opt_in: boolean;
  onboarding_completed: boolean;
  avatar_emoji: string;
}>;
