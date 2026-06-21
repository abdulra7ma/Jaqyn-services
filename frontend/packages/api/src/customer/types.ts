// Customer-facing domain types. Mirror tasks/_shared/SCHEMAS.md (only the fields
// the customer screens render). Kept in the API layer so screens stay decoupled
// from transport + backend shape.

export type Role = "customer" | "business_owner" | "staff" | "admin";
export type Language = "ru" | "en" | "ky";

export type User = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: Role;
  is_phone_verified: boolean;
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
};

export type PublicCatalogItem = {
  id: string;
  module: string;
  name: string;
  category: string;
  price: string;
  duration: string;
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
