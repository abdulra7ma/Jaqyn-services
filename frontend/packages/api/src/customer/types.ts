// Customer-facing domain types. Mirror backend/docs/data-model.md (only the fields
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
  profile_completed: boolean;
};

// App area a user lands in after login (backend resolves: owner > staff > customer).
export type Area = "customer" | "staff" | "business";

export type StaffMembership = {
  id: string;
  name: string;
  role: "cashier" | "manager";
  business_id: string;
  business_name: string;
  profile_completed: boolean;
};

export type Me = {
  user: User;
  /** Landing area after login (single). Use `areas` for what the user may switch into. */
  area: Area;
  /** Every area the user may enter — e.g. an owner-as-staff has both business + staff. */
  areas?: Area[];
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
  // The /q/<token> first-scan response carries no per-customer progress anymore
  // (the customer-rewards endpoints were removed in the campaigns restructure).
  progress: null;
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

// ---- Campaigns (apps.campaigns — campaigns-restructure design §3) -------------
// Every offer is a Campaign of one type: Individual visit challenge, Group, or
// Social. Complete the challenge → unlock a voucher → redeem.
// Mirrors only the fields the campaign screens render; the API layer is the
// boundary, so raw backend rows are coerced through ./adapters before reaching here.

// Campaign type discriminator (campaigns-restructure design §3). Replaces the
// legacy VISIT/TIME_WINDOW/GROUP enum. Group runs the group flow; Social is
// staff-verified proof.
export type CampaignType = "individual" | "group" | "social";

export type CampaignMechanic = "visit";

// Item-reward selection mode (multi-form-loyalty design): the business presets a
// fixed CatalogItem, or the customer chooses one at redemption time.
export type ItemSelection = "fixed" | "customer";

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

export type CampaignRewardType =
  | "free_item"
  | "discount"
  | "upgrade"
  | "custom";

// A catalog item (menu/service entry) the customer can pick as their reward, or
// that a business presets on an item program. Mirrors the customer-facing fields
// of businesses.CatalogItem (multi-form-loyalty slice 1 select-item contract).
export type CampaignCatalogItem = {
  id: string;
  name: string;
  price: string;
  image: string | null;
};

// Group-only: who receives the voucher. MVP issues to the leader (plan Q4).
export type CampaignRewardReceiver = "leader" | "every_member" | "table";

export type CampaignRule = {
  // INDIVIDUAL campaigns use visit counting. Null for non-individual campaigns.
  mechanic: CampaignMechanic | null;
  // INDIVIDUAL: number of verified visits required.
  required_count: number | null;
  // INDIVIDUAL: cap on actions counted per calendar day.
  max_count_per_day: number | null;
  // INDIVIDUAL: human-readable minimum gap between counted actions (e.g. "4 hours").
  min_time_between: string | null;
  // GROUP: required group size and the check-in window (e.g. "15 min").
  required_group_size: number | null;
  group_checkin_window: string | null;
  // GROUP: check-in window in raw minutes (used to bound the last bookable slot).
  group_checkin_window_minutes: number | null;
};

export type CampaignReward = {
  type: CampaignRewardType;
  title: string;
  description: string;
  // Days the voucher stays valid after it is unlocked (plan §1.1).
  expiry_days_after_unlock: number;
  max_redemptions: number | null;
  receiver?: CampaignRewardReceiver;
  // Item programs (FREE_ITEM/DISCOUNT): whether the item is business-preset
  // (fixed) or customer-chosen, and the preset item when fixed (multi-form-loyalty).
  item_selection: ItemSelection | null;
  catalog_item: CampaignCatalogItem | null;
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
  business: Pick<Business, "id" | "name" | "category" | "logo_url" | "area" | "address">;
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
  // Raw active-window times (HH:MM, may be empty). The group create screen
  // generates visit slots from these; active_hours is the combined display form.
  active_start_time: string;
  active_end_time: string;
  repeat_policy: CampaignRepeatPolicy;
  max_participants: number | null;
  rule: CampaignRule;
  reward: CampaignReward;
  // Present on customer detail/discover responses; absent on business lists.
  my_progress: CampaignProgress | null;
  // SOCIAL only — the Instagram handle customers follow/tag for the bonus.
  instagram_handle?: string | null;
  // Auto-join acquisition link (plan D9) — e.g. "jaqyn.kg/c/<token>".
  auto_join_link?: string | null;
};

// The customer campaigns feed (campaigns-restructure design §6). `followed` is the
// "From places you go" row (in-progress campaigns); `discover` is the filterable
// "Discover more" list. Cards in both route into the existing detail/group screens.
export type CampaignFeed = {
  followed: Campaign[];
  discover: Campaign[];
};

// Discover-list filter for the feed (campaigns-restructure design §6).
export type CampaignFeedFilter = "all" | "group" | "neighborhood" | "ended";

export type CampaignVoucherStatus = "active" | "redeemed" | "expired" | "cancelled";

export type CampaignVoucher = {
  domain?: "campaign" | "loyalty";
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
  // Item vouchers (multi-form-loyalty): the chosen/preset CatalogItem (null when a
  // customer-choice voucher has not been resolved yet), and the selection mode so
  // the present screen knows whether to show the "Choose your item" sheet.
  catalog_item: CampaignCatalogItem | null;
  item_selection: ItemSelection | null;
};

// Wallet groups vouchers by lifecycle for the three design sections.
export type CampaignWallet = {
  active: CampaignVoucher[];
  used: CampaignVoucher[];
  expired: CampaignVoucher[];
};

// Backend group-session lifecycle (campaigns-restructure backend contract):
// forming → full → checking_in → completed; expired/cancelled are terminal.
export type GroupSessionStatus =
  | "forming"
  | "full"
  | "checking_in"
  | "checked_in"
  | "completed"
  | "expired"
  | "cancelled";

export type GroupSessionMember = {
  id: string;
  name: string;
  initial: string;
  is_leader: boolean;
  is_you: boolean;
  checked_in: boolean;
  // Backend member.status (e.g. joined / checked_in). Surfaced for the status tag.
  status: string | null;
};

export type GroupSession = {
  id: string;
  campaign: { id: string; name: string; glyph: string };
  // Denormalized business fields the group screens render (backend contract).
  business_name: string;
  business_logo_url: string | null;
  // Customer id of the group leader (used to mark the leader row).
  group_leader: string | null;
  invite_code: string;
  // Full shareable invite URL (e.g. https://jaqyn.kg/g/<code>) from the backend.
  invite_url: string;
  status: GroupSessionStatus;
  required_size: number;
  joined_count: number;
  members: GroupSessionMember[];
  // Leader-chosen visit time (ISO 8601), optional group name + note to friends.
  visit_time: string | null;
  name: string | null;
  note: string | null;
  // QR payload shown to staff once the group is full (type GROUP_CHECKIN).
  checkin_token: string | null;
};

// One of the customer's groups, from GET /api/customer/campaign-groups/ (my-groups).
// Carries the campaign id so a screen can find the active group for a campaign.
export type MyGroup = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  business_name: string;
  business_logo_url: string | null;
  status: GroupSessionStatus;
  required_size: number;
  joined_count: number;
};

// Optional body for starting a group session (leader sets visit time / name / note).
export type StartGroupSessionInput = {
  campaignId: string;
  visit_time?: string;
  name?: string;
  note?: string;
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
// campaign_type enum; `joined=true` restricts to the viewer's own enrolled /
// in-progress campaigns.
export type CampaignListParams = Partial<{
  type: CampaignType;
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
  profile_completed?: boolean;
};
export type VerifyOtpResult = AuthResult;
export type PasswordLoginResult = AuthResult;
export type ResetPasswordResult = AuthResult;
export type ProfilePatch = Partial<{
  name: string;
  email: string;
  birthday: string;
  language: Language;
  marketing_opt_in: boolean;
  onboarding_completed: boolean;
  avatar_emoji: string;
}>;
