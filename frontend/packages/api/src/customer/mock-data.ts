import type {
  Business,
  GroupDeal,
  GroupOffer,
  Me,
  Redemption,
  RewardProgress,
} from "./types";

// In-memory seed for the mock API layer. Lets every customer screen render real
// states (loading/empty/error/success) before live endpoints are wired (F01 note).

export const mockBusinesses: Business[] = [
  {
    id: "b-coffee",
    name: "Sierra Coffee",
    category: "cafe",
    description: "Speciality coffee in the city centre.",
    address: "Chuy Ave 120",
    area: "Centre",
    latitude: "42.8768",
    longitude: "74.5893",
    phone: "+996700111222",
    instagram_url: "https://instagram.com/sierra",
    logo_url: null,
    cover_url: null,
    working_hours: { mon: ["08:00", "22:00"], sun: ["09:00", "21:00"] },
    distance_km: 0.4,
  },
  {
    id: "b-barber",
    name: "Sharp Barber",
    category: "barber",
    description: "Classic cuts and shaves.",
    address: "Sovetskaya 45",
    area: "Vostok-5",
    latitude: "42.8652",
    longitude: "74.6209",
    phone: "+996700333444",
    instagram_url: null,
    logo_url: null,
    cover_url: null,
    working_hours: { mon: ["10:00", "20:00"] },
    distance_km: 1.2,
  },
  {
    id: "b-bakery",
    name: "Naan & Co",
    category: "bakery",
    description: "Fresh bread daily.",
    address: "Ibraimova 12",
    area: "Centre",
    latitude: "42.8794",
    longitude: "74.6061",
    phone: "+996700555666",
    instagram_url: null,
    logo_url: null,
    cover_url: null,
    working_hours: { mon: ["07:00", "19:00"] },
    distance_km: 2.7,
  },
];

export const mockMe: Me = {
  user: {
    id: "u-1",
    phone: "+996700123456",
    name: "Aibek",
    email: null,
    role: "customer",
    is_phone_verified: true,
    avatar: null,
    avatar_emoji: "",
  },
  area: "customer",
  limits: { max_active_groups: 3 },
  profile: { birthday: null, language: "ru", marketing_opt_in: false, onboarding_completed: true },
};

export const mockProgress: RewardProgress[] = [
  {
    id: "rp-1",
    business: { id: "b-coffee", name: "Sierra Coffee", category: "cafe", logo_url: null, area: "Centre" },
    reward_program: {
      id: "prog-1",
      type: "stamp",
      title: "Coffee club",
      description: "Buy 6 coffees, get the 7th free.",
      required_count: 7,
      reward_description: "1 free coffee",
      terms: "Dine-in only.",
    },
    current_count: 4,
    target_count: 7,
    status: "active",
    unlocked_at: null,
    expires_at: null,
  },
  {
    id: "rp-2",
    business: { id: "b-barber", name: "Sharp Barber", category: "barber", logo_url: null, area: "Vostok-5" },
    reward_program: {
      id: "prog-2",
      type: "visit",
      title: "5 visits",
      description: "Every 5th cut free.",
      required_count: 5,
      reward_description: "Free haircut",
      terms: null,
    },
    current_count: 5,
    target_count: 5,
    status: "unlocked",
    unlocked_at: "2026-06-15T10:00:00Z",
    expires_at: "2026-07-15T10:00:00Z",
  },
];

export const mockRedemptions: Record<string, Redemption> = {};

// Seeded pending redemptions for wallet / businessRewardCard mocks
export const mockPendingRedemptions: Redemption[] = [
  {
    id: "red-barber-1",
    code: "JQ-BAR1",
    status: "pending",
    presented_at: null,
    redeemed_at: null,
    expires_at: "2026-08-15T10:00:00Z",
    reward_title: "Free haircut",
    reward_description: "Free haircut",
    business_name: "Sharp Barber",
    created_at: "2026-06-15T10:00:00Z",
  },
  {
    id: "red-barber-2",
    code: "JQ-BAR2",
    status: "pending",
    presented_at: null,
    redeemed_at: null,
    expires_at: "2026-09-01T10:00:00Z",
    reward_title: "Free haircut",
    reward_description: "Free haircut",
    business_name: "Sharp Barber",
    created_at: "2026-06-18T10:00:00Z",
  },
];

export const mockRedeemedHistory: Redemption[] = [
  {
    id: "red-barber-old-1",
    code: "JQ-BOLD1",
    status: "redeemed",
    presented_at: "2026-05-10T12:00:00Z",
    redeemed_at: "2026-05-10T12:05:00Z",
    expires_at: null,
    reward_title: "Free haircut",
    reward_description: "Free haircut",
    business_name: "Sharp Barber",
    created_at: "2026-05-08T10:00:00Z",
  },
];

export const mockGroupOffers: GroupOffer[] = [
  {
    id: "go-1",
    business: { id: "b-coffee", name: "Sierra Coffee", category: "cafe", area: "Centre", logo_url: null },
    title: "Bring 3 friends — free dessert each",
    description: "Come as a group of 4+ and everyone gets a dessert.",
    reward_type: "free_shared_item",
    reward_description: "Free dessert per person",
    min_group_size: 4,
    max_group_size: 8,
    valid_from: "2026-06-01",
    valid_to: "2026-08-31",
    time_start: "12:00",
    time_end: "18:00",
    checkin_window_minutes: 30,
    requires_staff_code: false,
    terms: "All members must check in within 30 min.",
    status: "active",
  },
  {
    id: "go-2",
    business: { id: "b-bakery", name: "Naan & Co", category: "bakery", area: "Centre", logo_url: null },
    title: "Group of 5 — 20% off",
    description: "Bigger orders, better price.",
    reward_type: "group_discount",
    reward_description: "20% off the whole order",
    min_group_size: 5,
    max_group_size: null,
    valid_from: "2026-06-01",
    valid_to: "2026-12-31",
    time_start: "09:00",
    time_end: "12:00",
    checkin_window_minutes: 20,
    requires_staff_code: false,
    terms: null,
    status: "active",
  },
];

export const mockGroups: GroupDeal[] = [
  {
    id: "gd-1",
    invite_token: "inv-abc123",
    group_offer: mockGroupOffers[0]!,
    visit_time: "2026-06-20T13:00:00Z",
    status: "forming",
    reward_code: null,
    members: [
      { id: "m-1", name: "Aibek", status: "joined", is_leader: true },
      { id: "m-2", name: "Nurlan", status: "joined", is_leader: false },
    ],
    is_member: true,
    is_leader: true,
    checked_in: false,
  },
];
