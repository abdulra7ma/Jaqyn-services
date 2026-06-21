// Customer API layer.
//
// One `CustomerApi` interface, two implementations:
//   • liveCustomerApi — real backend calls via the shared client. DEFERRED:
//     endpoints exist per tasks/_shared/API.md but are not yet verified end-to-end,
//     so they are gated off by default.
//   • mockCustomerApi — in-memory, drives every screen now.
//
// Switch with NEXT_PUBLIC_USE_MOCKS ("false" → live). Screens depend only on the
// interface, so wiring the backend later is a flag flip + per-endpoint verify.

import { api, API_URL } from "../client";
import { ApiClientError } from "../errors";
import { tokenStore } from "../tokens";
import { adaptBusiness, adaptDeal, adaptOffer, adaptProgress } from "./adapters";
import { session } from "./session";
import {
  mockBusinesses,
  mockGroupOffers,
  mockGroups,
  mockMe,
  mockPendingRedemptions,
  mockProgress,
  mockRedeemedHistory,
  mockRedemptions,
} from "./mock-data";
import type {
  Business,
  BusinessRewardCard,
  GroupDeal,
  GroupOffer,
  Me,
  ProfilePatch,
  PasswordLoginResult,
  Redemption,
  CustomerQr,
  NearbyParams,
  RequestOtpResult,
  RewardProgress,
  VerifyOtpResult,
  QrResolve,
  Wallet,
} from "./types";

export interface CustomerApi {
  requestOtp(phone: string): Promise<RequestOtpResult>;
  verifyOtp(phone: string, code: string): Promise<VerifyOtpResult>;
  passwordLogin(email: string, password: string): Promise<PasswordLoginResult>;
  me(): Promise<Me>;
  myQr(): Promise<CustomerQr>;
  updateProfile(patch: ProfilePatch): Promise<Me>;
  uploadAvatar(file: File): Promise<Me>;
  resolveQr(token: string): Promise<QrResolve>;
  collect(token: string, approvalCode: string): Promise<RewardProgress>;
  listRewards(): Promise<RewardProgress[]>;
  getReward(id: string): Promise<RewardProgress>;
  generateRedemptionCode(id: string): Promise<Redemption>;
  listGroupOffers(): Promise<GroupOffer[]>;
  getGroupOffer(id: string): Promise<GroupOffer>;
  createGroup(offerId: string, visitTime: string): Promise<GroupDeal>;
  getGroup(inviteToken: string): Promise<GroupDeal>;
  joinGroup(id: string): Promise<GroupDeal>;
  leaveGroup(id: string): Promise<GroupDeal>;
  cancelGroup(id: string): Promise<GroupDeal>;
  checkInGroup(id: string, approvalCode?: string): Promise<GroupDeal>;
  listMyGroups(): Promise<GroupDeal[]>;
  listNearby(params?: NearbyParams): Promise<Business[]>;
  getBusiness(id: string, params?: Pick<NearbyParams, "lat" | "lng">): Promise<Business>;
  wallet(): Promise<Wallet>;
  presentRedemption(id: string): Promise<Redemption>;
  businessRewardCard(businessId: string): Promise<BusinessRewardCard>;
}

// ----------------------------------------------------------------------------
// Live implementation — wired to the running backend (envelope unwrapped by the
// client; lists arrive as {results:[…]}; raw rows mapped via ./adapters).
// Nearby + business public profile are live and support search/category/location
// filters. Mock mode remains available for local UI work.
// ----------------------------------------------------------------------------
type Paginated<T> = { results: T[]; count?: number; next?: string | null };

function queryString(params?: NearbyParams): string {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const liveCustomerApi: CustomerApi = {
  requestOtp: (phone) =>
    api.post<RequestOtpResult>("/api/auth/request-otp/", { phone }, { auth: false }),
  verifyOtp: async (phone, code) => {
    const res = await api.post<VerifyOtpResult>(
      "/api/auth/verify-otp/",
      { phone, code },
      { auth: false },
    );
    tokenStore.set(res.access, res.refresh);
    session.setUserId(res.user.id);
    return res;
  },
  passwordLogin: async (email, password) => {
    const res = await api.post<PasswordLoginResult>(
      "/api/auth/login-password/",
      { email, password },
      { auth: false },
    );
    tokenStore.set(res.access, res.refresh);
    session.setUserId(res.user.id);
    return res;
  },
  async me() {
    const me = await api.get<Me>("/api/auth/me/");
    if (me.user?.id) session.setUserId(me.user.id);
    return me;
  },
  myQr: () => api.get<CustomerQr>("/api/customer/qr/"),
  updateProfile: (patch) => api.patch("/api/auth/profile/", patch),
  async uploadAvatar(file) {
    // Must send as multipart — do NOT use the api client (it forces JSON body).
    const form = new FormData();
    form.append("avatar", file);
    const access = tokenStore.getAccess();
    const headers: Record<string, string> = {};
    if (access) headers["Authorization"] = `Bearer ${access}`;
    const baseUrl = API_URL.startsWith("http") ? API_URL : "";
    const res = await fetch(`${baseUrl}/api/auth/avatar/`, {
      method: "POST",
      headers,
      body: form,
    });
    const json = await res.json() as { success: boolean; data: Me };
    if (!json || json.success === false) throw new Error("Avatar upload failed");
    return json.data;
  },
  async resolveQr(token) {
    const raw = await api.get<any>(`/api/qr/${token}/`, { auth: false });
    const r = raw.context?.active_reward;
    return {
      token,
      type: raw.type,
      business: raw.business
        ? {
            id: raw.business.id,
            name: raw.business.name ?? "",
            category: "other",
            description: null,
            address: "",
            area: "",
            latitude: null,
            longitude: null,
            phone: "",
            public_email: null,
            website_url: null,
            instagram_url: null,
            logo_url: null,
            cover_url: null,
            glyph: "",
            accent_color: "#C25E3C",
            price_level: "",
            tags: [],
            working_hours: null,
          }
        : null,
      reward_program: r
        ? {
            id: r.id,
            type: r.type ?? "stamp",
            title: r.title,
            description: "",
            required_count: r.required_count ?? null,
            reward_description: r.reward_description ?? "",
            terms: null,
          }
        : null,
      progress: null,
    };
  },
  collect: (token, approval_code) =>
    api.post<any>(`/api/qr/${token}/collect/`, { approval_code }).then(adaptProgress),
  listRewards: () =>
    api.get<Paginated<any>>("/api/customer/rewards/").then((d) => d.results.map(adaptProgress)),
  getReward: (id) => api.get<any>(`/api/customer/rewards/${id}/`).then(adaptProgress),
  generateRedemptionCode: (id) =>
    api
      .post<any>(`/api/customer/rewards/${id}/generate-redemption-code/`)
      .then((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        presented_at: r.presented_at ?? null,
        redeemed_at: r.redeemed_at ?? null,
        expires_at: r.expires_at ?? null,
      })),
  listGroupOffers: () =>
    api
      .get<Paginated<any>>("/api/group-offers/", { auth: false })
      .then((d) => d.results.map(adaptOffer)),
  getGroupOffer: (id) => api.get<any>(`/api/group-offers/${id}/`, { auth: false }).then(adaptOffer),
  createGroup: (group_offer, visit_time) =>
    api.post<any>("/api/groups/", { group_offer, visit_time }).then(adaptDeal),
  getGroup: (inviteToken) => api.get<any>(`/api/groups/${inviteToken}/`, { auth: false }).then(adaptDeal),
  joinGroup: (id) => api.post<any>(`/api/groups/${id}/join/`).then(adaptDeal),
  leaveGroup: (id) => api.post<any>(`/api/groups/${id}/leave/`).then(adaptDeal),
  cancelGroup: (id) => api.post<any>(`/api/groups/${id}/cancel/`).then(adaptDeal),
  checkInGroup: (id, approval_code) =>
    api.post<any>(`/api/groups/${id}/check-in/`, { approval_code }).then(adaptDeal),
  listMyGroups: () =>
    api.get<Paginated<any>>("/api/customer/groups/").then((d) => d.results.map(adaptDeal)),
  listNearby: (params) =>
    api
      .get<Paginated<any>>(`/api/businesses/nearby/${queryString(params)}`, { auth: false })
      .then((d) => d.results.map(adaptBusiness)),
  getBusiness: (id, params) =>
    api.get<any>(`/api/businesses/${id}/${queryString(params)}`, { auth: false }).then(adaptBusiness),
  wallet: () => api.get<Wallet>("/api/customer/wallet/"),
  presentRedemption: (id) => api.post<Redemption>(`/api/customer/redemptions/${id}/present/`),
  businessRewardCard: (businessId) =>
    api.get<BusinessRewardCard>(`/api/customer/businesses/${businessId}/rewards/`),
};

// ----------------------------------------------------------------------------
// Mock implementation (ACTIVE) — in-memory, simulated latency
// ----------------------------------------------------------------------------
const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function find<T extends { id: string }>(list: T[], id: string, what: string): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new ApiClientError("VALIDATION_ERROR", `${what} not found`, 404);
  return item;
}

export const mockCustomerApi: CustomerApi = {
  async requestOtp(phone) {
    await delay();
    if (!/^\+?\d{9,15}$/.test(phone)) {
      throw new ApiClientError("VALIDATION_ERROR", "Invalid phone", 400);
    }
    return { request_id: "mock-req", expires_in: 300 };
  },
  async verifyOtp(phone, code) {
    await delay();
    if (!/^\d{4,6}$/.test(code)) throw new ApiClientError("INVALID_OTP", "Invalid code", 400);
    const res: VerifyOtpResult = {
      access: "mock-access",
      refresh: "mock-refresh",
      user: { ...mockMe.user, phone },
      area: "customer",
      is_new: true,
      onboarding_completed: false,
    };
    tokenStore.set(res.access, res.refresh);
    session.setUserId(res.user.id);
    return res;
  },
  async passwordLogin(email) {
    await delay();
    const res: PasswordLoginResult = {
      access: "mock-access",
      refresh: "mock-refresh",
      user: { ...mockMe.user, email },
      area: "customer",
      onboarding_completed: true,
    };
    tokenStore.set(res.access, res.refresh);
    session.setUserId(res.user.id);
    return res;
  },
  async me() {
    await delay();
    session.setUserId(mockMe.user.id);
    return clone(mockMe);
  },
  async myQr() {
    await delay();
    const svg =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='#fff'/><rect x='20' y='20' width='160' height='160' fill='none' stroke='#2E241D' stroke-width='8'/><text x='100' y='110' font-size='18' text-anchor='middle' fill='#2E241D'>MOCK QR</text></svg>`,
      );
    return { token: "mock-profile", type: "customer_profile", url: "/", png: svg };
  },
  async updateProfile(patch) {
    await delay();
    if (patch.name !== undefined) mockMe.user.name = patch.name;
    if (patch.email !== undefined) mockMe.user.email = patch.email;
    if (patch.avatar_emoji !== undefined) {
      mockMe.user.avatar_emoji = patch.avatar_emoji;
      // setting emoji clears photo (mirrors backend behaviour)
      if (patch.avatar_emoji) mockMe.user.avatar = null;
    }
    if (mockMe.profile) {
      if (patch.birthday !== undefined) mockMe.profile.birthday = patch.birthday;
      if (patch.language !== undefined) mockMe.profile.language = patch.language;
      if (patch.marketing_opt_in !== undefined)
        mockMe.profile.marketing_opt_in = patch.marketing_opt_in;
    }
    return clone(mockMe);
  },
  async uploadAvatar(file) {
    await delay();
    // In mock mode produce a data URL so the UI can preview without a server.
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        mockMe.user.avatar = reader.result as string;
        mockMe.user.avatar_emoji = "";
        resolve(clone(mockMe));
      };
      reader.onerror = () => {
        mockMe.user.avatar = null;
        resolve(clone(mockMe));
      };
      reader.readAsDataURL(file);
    });
  },
  async resolveQr(token) {
    await delay();
    const business = mockBusinesses[0]!;
    const prog = mockProgress[0]!;
    return {
      token,
      type: "merchant_collect",
      business,
      reward_program: prog.reward_program,
      progress: clone(prog),
    };
  },
  async collect(_token, approvalCode) {
    await delay();
    if (!/^\d{4,6}$/.test(approvalCode)) {
      throw new ApiClientError("INVALID_APPROVAL_CODE", "Invalid approval code", 400);
    }
    const prog = mockProgress[0]!;
    if (prog.status === "active") {
      prog.current_count = Math.min(prog.current_count + 1, prog.target_count ?? prog.current_count + 1);
      if (prog.target_count && prog.current_count >= prog.target_count) {
        prog.status = "unlocked";
        prog.unlocked_at = "2026-06-17T00:00:00Z";
      }
    }
    return clone(prog);
  },
  async listRewards() {
    await delay();
    return clone(mockProgress);
  },
  async getReward(id) {
    await delay();
    return clone(find(mockProgress, id, "Reward"));
  },
  async generateRedemptionCode(id) {
    await delay();
    const prog = find(mockProgress, id, "Reward");
    if (prog.status !== "unlocked") {
      throw new ApiClientError("REWARD_EXPIRED", "Reward is not unlocked", 409);
    }
    const code = `JQ-${id.slice(-4).toUpperCase()}`;
    const redemption: Redemption = {
      id: `red-${id}`,
      code,
      status: "pending",
      presented_at: null,
      redeemed_at: null,
      expires_at: "2026-07-17T00:00:00Z",
      reward_description: prog.reward_program.reward_description,
      business_name: prog.business.name,
    };
    mockRedemptions[id] = redemption;
    return clone(redemption);
  },
  async listGroupOffers() {
    await delay();
    return clone(mockGroupOffers);
  },
  async getGroupOffer(id) {
    await delay();
    return clone(find(mockGroupOffers, id, "Group offer"));
  },
  async createGroup(offerId, visitTime) {
    await delay();
    const offer = find(mockGroupOffers, offerId, "Group offer");
    const deal: GroupDeal = {
      id: `gd-${mockGroups.length + 1}`,
      invite_token: `inv-${offerId}-${mockGroups.length + 1}`,
      group_offer: clone(offer),
      visit_time: visitTime,
      status: "forming",
      reward_code: null,
      members: [{ id: "m-self", name: mockMe.user.name ?? "You", status: "joined", is_leader: true }],
      is_member: true,
      is_leader: true,
      checked_in: false,
    };
    mockGroups.push(deal);
    return clone(deal);
  },
  async getGroup(inviteToken) {
    await delay();
    const deal = mockGroups.find((g) => g.invite_token === inviteToken);
    if (!deal) throw new ApiClientError("GROUP_NOT_ACTIVE", "Group not found", 404);
    return clone(deal);
  },
  async joinGroup(id) {
    await delay();
    const deal = find(mockGroups, id, "Group");
    if (deal.group_offer.max_group_size && deal.members.length >= deal.group_offer.max_group_size) {
      throw new ApiClientError("GROUP_FULL", "Group is full", 409);
    }
    if (!deal.members.some((m) => m.id === "m-self")) {
      deal.members.push({ id: "m-self", name: mockMe.user.name ?? "You", status: "joined", is_leader: false });
      deal.is_member = true;
    }
    return clone(deal);
  },
  async leaveGroup(id) {
    await delay();
    const deal = find(mockGroups, id, "Group");
    deal.members = deal.members.filter((m) => m.id !== "m-self");
    deal.is_member = false;
    return clone(deal);
  },
  async cancelGroup(id) {
    await delay();
    const deal = find(mockGroups, id, "Group");
    deal.status = "cancelled";
    return clone(deal);
  },
  async checkInGroup(id, _approvalCode) {
    await delay();
    const deal = find(mockGroups, id, "Group");
    deal.checked_in = true;
    const self = deal.members.find((m) => m.id === "m-self");
    if (self) self.status = "checked_in";
    if (deal.members.every((m) => m.status === "checked_in") && deal.members.length >= deal.group_offer.min_group_size) {
      deal.status = "completed";
      deal.reward_code = `GRP-${deal.id.toUpperCase()}`;
    }
    return clone(deal);
  },
  async listMyGroups() {
    await delay();
    return clone(mockGroups.filter((g) => g.is_member));
  },
  async listNearby() {
    await delay();
    return clone(mockBusinesses);
  },
  async getBusiness(id) {
    await delay();
    return clone(find(mockBusinesses, id, "Business"));
  },
  async wallet() {
    await delay();
    // Group pending redemptions by (business_name, reward_title)
    const allPending = [...mockPendingRedemptions, ...Object.values(mockRedemptions)].filter(
      (r) => r.status === "pending",
    );
    const grouped = new Map<
      string,
      { businessId: string; businessName: string; rewardTitle: string; rewardDesc: string; items: typeof allPending }
    >();
    for (const r of allPending) {
      const prog = mockProgress.find((p) => p.business.name === r.business_name);
      const businessId = prog?.business.id ?? r.business_name ?? "unknown";
      const key = `${businessId}:${r.reward_title ?? ""}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          businessId,
          businessName: r.business_name ?? "",
          rewardTitle: r.reward_title ?? "",
          rewardDesc: r.reward_description ?? "",
          items: [],
        });
      }
      grouped.get(key)!.items.push(r);
    }
    const available: Wallet["available"] = Array.from(grouped.values()).map((g) => {
      const sorted = [...g.items].sort((a, b) => {
        if (!a.expires_at) return 1;
        if (!b.expires_at) return -1;
        return a.expires_at < b.expires_at ? -1 : 1;
      });
      return {
        business: { id: g.businessId, name: g.businessName },
        reward: { id: g.items[0]!.id, title: g.rewardTitle, description: g.rewardDesc },
        count: g.items.length,
        soonest_expiry: sorted[0]?.expires_at ?? null,
        redemption_ids: g.items.map((r) => r.id),
      };
    });
    return clone({ available, in_progress: mockProgress });
  },
  async presentRedemption(id) {
    await delay();
    // Search in pendingRedemptions then mockRedemptions
    const inSeed = mockPendingRedemptions.find((r) => r.id === id);
    if (inSeed) {
      // Clear other presented_at flags
      mockPendingRedemptions.forEach((r) => { r.presented_at = null; });
      inSeed.presented_at = new Date().toISOString();
      return clone(inSeed);
    }
    const fromMap = Object.values(mockRedemptions).find((r) => r.id === id);
    if (fromMap) {
      Object.values(mockRedemptions).forEach((r) => { r.presented_at = null; });
      fromMap.presented_at = new Date().toISOString();
      return clone(fromMap);
    }
    throw new ApiClientError("VALIDATION_ERROR", "Redemption not found", 404);
  },
  async businessRewardCard(businessId) {
    await delay();
    const biz = find(mockBusinesses, businessId, "Business");
    const programs = mockProgress
      .filter((p) => p.business.id === businessId)
      .map((p) => ({
        id: p.reward_program.id,
        type: p.reward_program.type,
        title: p.reward_program.title,
        reward_description: p.reward_program.reward_description,
        current_count: p.current_count,
        target_count: p.target_count,
        current_spend: "0.00",
        required_spend: null,
        completed_count: 0,
        available_count: mockPendingRedemptions.filter(
          (r) => r.business_name === biz.name && r.status === "pending",
        ).length,
        bank_full: false,
      }));
    const available = mockPendingRedemptions
      .filter((r) => r.business_name === biz.name && r.status === "pending")
      .map((r) => ({
        id: r.id,
        reward_title: r.reward_title ?? "",
        reward_description: r.reward_description ?? "",
        expires_at: r.expires_at,
        created_at: r.created_at ?? new Date().toISOString(),
      }));
    const history = mockRedeemedHistory
      .filter((r) => r.business_name === biz.name && r.status !== "pending")
      .map((r) => ({
        id: r.id,
        reward_title: r.reward_title ?? "",
        status: r.status,
        redeemed_at: r.redeemed_at,
        created_at: r.created_at ?? new Date().toISOString(),
      }));
    return clone({
      business: { id: biz.id, name: biz.name, area: biz.area },
      programs,
      available,
      history,
    });
  },
};

// Default LIVE. Set NEXT_PUBLIC_USE_MOCKS="true" to drive screens from seed data.
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
export const customerApi: CustomerApi = USE_MOCKS ? mockCustomerApi : liveCustomerApi;
