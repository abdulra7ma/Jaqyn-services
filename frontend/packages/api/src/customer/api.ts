// Customer API layer.
//
// One `CustomerApi` interface with a single live implementation that calls the
// running backend via the shared client. The client unwraps the {success,data}
// envelope; lists arrive as {results:[…]}; raw rows are mapped via ./adapters.
// Screens depend only on the interface (consumed through ./hooks), never on the
// concrete object — so the wiring stays swappable without touching a screen.

import { api, API_URL } from "../client";
import {
  adaptBusiness,
  adaptBusinessLoyaltyProgram,
  adaptCampaign,
  adaptCampaignFeed,
  adaptCampaignVoucher,
  adaptCampaignWallet,
  adaptCatalogItem,
  adaptGroupSession,
  adaptMyGroup,
} from "./adapters";
import { session } from "./session";
import { tokenStore } from "../tokens";
import type {
  Business,
  BusinessLoyaltyProgram,
  Campaign,
  CampaignCatalogItem,
  CampaignFeed,
  CampaignFeedFilter,
  CategoryOption,
  CampaignListParams,
  CampaignVoucher,
  CampaignWallet,
  EmailOtpResult,
  GroupSession,
  Me,
  MyGroup,
  ProfilePatch,
  PasswordLoginResult,
  ResetPasswordResult,
  CustomerQr,
  NearbyParams,
  RequestEmailOtpPayload,
  RequestOtpResult,
  StartGroupSessionInput,
  VerifyOtpResult,
  QrResolve,
} from "./types";

export interface CustomerApi {
  requestOtp(phone: string): Promise<RequestOtpResult>;
  verifyOtp(phone: string, code: string): Promise<VerifyOtpResult>;
  passwordLogin(email: string, password: string): Promise<PasswordLoginResult>;
  requestPasswordReset(email: string): Promise<{ message: string }>;
  resetPassword(email: string, code: string, newPassword: string): Promise<ResetPasswordResult>;
  requestEmailOtp(payload: RequestEmailOtpPayload): Promise<RequestOtpResult>;
  verifyEmailOtp(email: string, code: string): Promise<EmailOtpResult>;
  me(): Promise<Me>;
  myQr(): Promise<CustomerQr>;
  updateProfile(patch: ProfilePatch): Promise<Me>;
  uploadAvatar(file: File): Promise<Me>;
  resolveQr(token: string): Promise<QrResolve>;
  listNearby(params?: NearbyParams): Promise<Business[]>;
  listCategories(): Promise<CategoryOption[]>;
  getBusiness(id: string, params?: Pick<NearbyParams, "lat" | "lng">): Promise<Business>;
  // ---- loyalty (multi-form-loyalty slice 2) ----
  // Every active INDIVIDUAL program of a business + the viewer's state on each.
  listBusinessLoyalty(businessId: string): Promise<BusinessLoyaltyProgram[]>;
  // ---- campaigns (plan §3) ----
  listCampaigns(params?: CampaignListParams): Promise<Campaign[]>;
  campaignFeed(filter?: CampaignFeedFilter): Promise<CampaignFeed>;
  getCampaign(id: string): Promise<Campaign>;
  joinCampaign(id: string): Promise<Campaign>;
  campaignWallet(): Promise<CampaignWallet>;
  getCampaignVoucher(id: string): Promise<CampaignVoucher>;
  presentCampaignVoucher(id: string): Promise<CampaignVoucher>;
  // ---- points + item rewards (multi-form-loyalty slice 1/3) ----
  // Redeem `points` from a POINTS campaign into a cashback voucher.
  redeemPoints(campaignId: string, points: number): Promise<CampaignVoucher>;
  // The catalog items a customer can pick for an item voucher (paginated).
  campaignCatalog(campaignId: string): Promise<CampaignCatalogItem[]>;
  // Resolve a customer-choice item voucher by selecting a catalog item.
  selectVoucherItem(voucherId: string, catalogItemId: string): Promise<CampaignVoucher>;
  // Leader starts (or idempotently re-fetches) a group session; the optional
  // body sets visit time / name / note (backend contract).
  startGroupSession(input: StartGroupSessionInput): Promise<GroupSession>;
  getGroupSession(id: string): Promise<GroupSession>;
  inviteToGroupSession(id: string): Promise<GroupSession>;
  leaveGroupSession(id: string): Promise<{ success: boolean }>;
  // DEV-only seeding aid; the backend 403s when DEBUG is off.
  demoFillGroup(id: string): Promise<GroupSession>;
  // The customer's own groups; used to find the active group for a campaign.
  listMyGroups(): Promise<MyGroup[]>;
}

// ----------------------------------------------------------------------------
// Live implementation — wired to the running backend (envelope unwrapped by the
// client; lists arrive as {results:[…]}; raw rows mapped via ./adapters).
// Nearby + business public profile support search/category/location filters.
// ----------------------------------------------------------------------------
type Paginated<T> = { results: T[]; count?: number; next?: string | null };

function queryString(params?: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const customerApi: CustomerApi = {
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
  requestPasswordReset: (email) =>
    api.post<{ message: string }>("/api/auth/request-password-reset/", { email }, { auth: false }),
  resetPassword: async (email, code, new_password) => {
    const res = await api.post<ResetPasswordResult>(
      "/api/auth/reset-password/",
      { email, code, new_password },
      { auth: false },
    );
    tokenStore.set(res.access, res.refresh);
    session.setUserId(res.user.id);
    return res;
  },
  requestEmailOtp: (payload) =>
    api.post<RequestOtpResult>("/api/auth/request-email-otp/", payload, { auth: false }),
  verifyEmailOtp: async (email, code) => {
    const res = await api.post<EmailOtpResult>(
      "/api/auth/verify-email-otp/",
      { email, code },
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
  listNearby: (params) =>
    api
      .get<Paginated<any>>(`/api/businesses/nearby/${queryString(params)}`, { auth: false })
      .then((d) => d.results.map(adaptBusiness)),
  listCategories: () =>
    api
      .get<Paginated<CategoryOption>>("/api/businesses/categories/", { auth: false })
      .then((d) => d.results),
  getBusiness: (id, params) =>
    api.get<any>(`/api/businesses/${id}/${queryString(params)}`, { auth: false }).then(adaptBusiness),
  listBusinessLoyalty: (businessId) =>
    api
      .get<Paginated<any>>(`/api/customer/businesses/${businessId}/loyalty/`)
      .then((d) => (d.results ?? []).map(adaptBusinessLoyaltyProgram)),
  listCampaigns: (params) =>
    api
      .get<Paginated<any>>(`/api/customer/campaigns/${queryString(params)}`)
      .then((d) => d.results.map(adaptCampaign)),
  // The feed endpoint returns {followed, discover} directly (not paginated) —
  // campaigns-restructure design §6. `discover` filters the discover list only.
  campaignFeed: (filter) =>
    api
      .get<any>(`/api/customer/campaigns/feed/${queryString(filter ? { discover: filter } : undefined)}`)
      .then(adaptCampaignFeed),
  getCampaign: (id) => api.get<any>(`/api/customer/campaigns/${id}/`).then(adaptCampaign),
  // The join endpoint returns the participant/progress row, not a campaign. Re-read
  // the campaign detail (which carries my_progress) so the hook caches a real
  // Campaign under the right key.
  joinCampaign: async (id) => {
    await api.post<any>(`/api/customer/campaigns/${id}/join/`);
    return api.get<any>(`/api/customer/campaigns/${id}/`).then(adaptCampaign);
  },
  campaignWallet: () =>
    api.get<Paginated<any>>("/api/customer/campaign-wallet/").then((d) => adaptCampaignWallet(d.results)),
  getCampaignVoucher: (id) =>
    api.get<any>(`/api/customer/campaign-vouchers/${id}/`).then(adaptCampaignVoucher),
  presentCampaignVoucher: (id) =>
    api.post<any>(`/api/customer/campaign-vouchers/${id}/present/`).then(adaptCampaignVoucher),
  redeemPoints: (campaignId, points) =>
    api
      .post<any>(`/api/customer/campaigns/${campaignId}/redeem-points/`, { points })
      .then(adaptCampaignVoucher),
  campaignCatalog: (campaignId) =>
    api
      .get<Paginated<any>>(`/api/customer/campaigns/${campaignId}/catalog/`)
      .then((d) => (d.results ?? []).map(adaptCatalogItem).filter((i): i is CampaignCatalogItem => i != null)),
  selectVoucherItem: (voucherId, catalogItemId) =>
    api
      .post<any>(`/api/customer/campaign-vouchers/${voucherId}/select-item/`, {
        catalog_item_id: catalogItemId,
      })
      .then(adaptCampaignVoucher),
  startGroupSession: ({ campaignId, visit_time, name, note }) =>
    api
      .post<any>(`/api/customer/campaigns/${campaignId}/group/start/`, { visit_time, name, note })
      .then(adaptGroupSession),
  // Group sessions are mounted at /api/customer/campaign-groups/<id>/ (see
  // apps.campaigns.customer_urls), not /group-sessions/.
  getGroupSession: (id) =>
    api.get<any>(`/api/customer/campaign-groups/${id}/`).then(adaptGroupSession),
  inviteToGroupSession: (id) =>
    api.post<any>(`/api/customer/campaign-groups/${id}/invite/`).then(adaptGroupSession),
  leaveGroupSession: (id) =>
    api.post<{ success: boolean }>(`/api/customer/campaign-groups/${id}/leave/`),
  demoFillGroup: (id) =>
    api.post<any>(`/api/customer/campaign-groups/${id}/demo-fill/`).then(adaptGroupSession),
  listMyGroups: () =>
    api
      .get<Paginated<any>>("/api/customer/campaign-groups/")
      .then((d) => d.results.map(adaptMyGroup)),
};
