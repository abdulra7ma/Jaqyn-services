// Business API layer — wired live to the backend (envelope unwrapped by client,
// lists arrive as {results:[…]}). Screens consume only the hooks in ./hooks.
// Campaign methods (apps.campaigns) map raw rows through ./adapters.
import { API_URL, api } from "../client";
import { tokenStore } from "../tokens";
import {
  adaptBusinessCampaign,
  adaptCampaignList,
  adaptParticipant,
  adaptSocialPost,
  adaptVoucherRow,
  toCampaignWritePayload,
} from "./adapters";
import type {
  ActivateResponse,
  ApprovalCode,
  BusinessCampaign,
  BusinessCampaignListResponse,
  BusinessGroupDeal,
  BusinessProfile,
  BusinessRegisterPayload,
  BusinessType,
  CampaignLifecycleAction,
  CampaignParticipantRow,
  CampaignPayload,
  CampaignSocialPost,
  CampaignVoucherRow,
  CatalogItem,
  CatalogItemPayload,
  Dashboard,
  GroupOfferFull,
  GroupOfferPayload,
  InviteValidation,
  MaskedCustomer,
  MerchantQr,
  OnboardingProfilePatch,
  OnboardingState,
  RewardProgramFull,
  RewardProgramPayload,
  StaffInvite,
  StaffInviteList,
  StaffInvitePayload,
} from "./types";

type Paginated<T> = { results: T[] };

export const businessApi = {
  register: (payload: BusinessRegisterPayload) =>
    api.post<BusinessProfile>("/api/business/register/", payload),
  me: () => api.get<BusinessProfile>("/api/business/me/"),
  updateMe: (patch: Omit<Partial<BusinessProfile>, "working_hours"> & { working_hours?: unknown }) =>
    api.patch<BusinessProfile>("/api/business/me/", patch),
  dashboard: () => api.get<Dashboard>("/api/business/dashboard/"),
  qr: () => api.get<MerchantQr>("/api/business/qr/"),
  regenerateApprovalCode: () =>
    api.post<ApprovalCode>("/api/business/approval-code/regenerate/"),

  listRewards: () =>
    api.get<Paginated<RewardProgramFull>>("/api/business/rewards/").then((d) => d.results),
  createReward: (payload: RewardProgramPayload) =>
    api.post<RewardProgramFull>("/api/business/rewards/", payload),
  getReward: (id: string) => api.get<RewardProgramFull>(`/api/business/rewards/${id}/`),
  updateReward: (id: string, patch: Partial<RewardProgramPayload>) =>
    api.patch<RewardProgramFull>(`/api/business/rewards/${id}/`, patch),
  pauseReward: (id: string) => api.post<RewardProgramFull>(`/api/business/rewards/${id}/pause/`),
  activateReward: (id: string) =>
    api.post<RewardProgramFull>(`/api/business/rewards/${id}/activate/`),

  listOffers: () =>
    api.get<Paginated<GroupOfferFull>>("/api/business/group-offers/").then((d) => d.results),
  listGroupDeals: () =>
    api.get<Paginated<BusinessGroupDeal>>("/api/business/group-deals/").then((d) => d.results),
  createOffer: (payload: GroupOfferPayload) =>
    api.post<GroupOfferFull>("/api/business/group-offers/", payload),
  updateOffer: (id: string, patch: Partial<GroupOfferPayload>) =>
    api.patch<GroupOfferFull>(`/api/business/group-offers/${id}/`, patch),
  submitOffer: (id: string) =>
    api.post<GroupOfferFull>(`/api/business/group-offers/${id}/submit-for-approval/`),
  deleteOffer: (id: string) => api.delete<unknown>(`/api/business/group-offers/${id}/`),
  pauseOffer: (id: string) => api.post<GroupOfferFull>(`/api/business/group-offers/${id}/pause/`),
  activateOffer: (id: string) =>
    api.post<GroupOfferFull>(`/api/business/group-offers/${id}/activate/`),

  reports: () => api.get<Record<string, number | string>>("/api/business/reports/"),
  customers: () =>
    api.get<Paginated<MaskedCustomer>>("/api/business/customers/").then((d) => d.results),

  // ---- onboarding ----
  businessTypes: () =>
    api.get<Paginated<BusinessType>>("/api/business-types/", { auth: false }).then((d) => d.results),
  validateInvite: (token: string) =>
    api.get<InviteValidation>(`/api/business/invites/validate/?token=${encodeURIComponent(token)}`, {
      auth: false,
    }),
  activateInvite: (body: { token: string; full_name: string; password: string }) =>
    api.post<ActivateResponse>("/api/business/invites/activate/", body, { auth: false }),

  onboarding: () => api.get<OnboardingState>("/api/business/onboarding/"),
  saveOnboarding: (patch: OnboardingProfilePatch) =>
    api.patch<{ business: BusinessProfile } & OnboardingState>("/api/business/onboarding/", patch),
  submitOnboarding: () => api.post<OnboardingState>("/api/business/onboarding/submit/"),

  listCatalog: () =>
    api.get<Paginated<CatalogItem>>("/api/business/catalog-items/").then((d) => d.results),
  addCatalogItem: (payload: CatalogItemPayload) =>
    api.post<CatalogItem>("/api/business/catalog-items/", payload),
  removeCatalogItem: (id: string) => api.delete<unknown>(`/api/business/catalog-items/${id}/`),

  listStaffInvites: () => api.get<StaffInviteList>("/api/business/staff-invites/"),
  addStaffInvite: (payload: StaffInvitePayload) =>
    api.post<StaffInvite>("/api/business/staff-invites/", payload),
  removeStaffInvite: (id: string) => api.delete<unknown>(`/api/business/staff-invites/${id}/`),

  // ---- campaigns (apps.campaigns — plan §1.3) ----
  listCampaigns: (): Promise<BusinessCampaignListResponse> =>
    api.get<any>("/api/business/campaigns/").then(adaptCampaignList),
  getCampaign: (id: string): Promise<BusinessCampaign> =>
    api.get<any>(`/api/business/campaigns/${id}/`).then(adaptBusinessCampaign),
  createCampaign: (payload: CampaignPayload): Promise<BusinessCampaign> =>
    api
      .post<any>("/api/business/campaigns/", toCampaignWritePayload(payload))
      .then(adaptBusinessCampaign),
  updateCampaign: (id: string, patch: Partial<CampaignPayload>): Promise<BusinessCampaign> =>
    api
      .put<any>(`/api/business/campaigns/${id}/`, toCampaignWritePayload(patch))
      .then(adaptBusinessCampaign),
  campaignAction: (id: string, action: CampaignLifecycleAction): Promise<BusinessCampaign> =>
    api.post<any>(`/api/business/campaigns/${id}/${action}/`).then(adaptBusinessCampaign),
  duplicateCampaign: (id: string): Promise<BusinessCampaign> =>
    api.post<any>(`/api/business/campaigns/${id}/duplicate/`).then(adaptBusinessCampaign),
  campaignParticipants: (id: string): Promise<CampaignParticipantRow[]> =>
    api
      .get<Paginated<any>>(`/api/business/campaigns/${id}/participants/`)
      .then((d) => d.results.map(adaptParticipant)),
  campaignVouchers: (id: string): Promise<CampaignVoucherRow[]> =>
    api
      .get<Paginated<any>>(`/api/business/campaigns/${id}/vouchers/`)
      .then((d) => d.results.map(adaptVoucherRow)),
  // The analytics endpoint returns the analytics block flat; reuse the campaign
  // adapter by nesting the raw row under `analytics` so the shape matches.
  campaignAnalytics: (id: string): Promise<BusinessCampaign["analytics"]> =>
    api
      .get<any>(`/api/business/campaigns/${id}/analytics/`)
      .then((raw) => adaptBusinessCampaign({ ...raw, analytics: raw }).analytics),
  cancelCampaignVoucher: (voucherId: string, reason: string): Promise<CampaignVoucherRow> =>
    api
      .post<any>(`/api/business/campaigns/vouchers/${voucherId}/cancel/`, { reason })
      .then(adaptVoucherRow),

  // Social Post Studio. The image upload is multipart, so it bypasses the JSON
  // `api` client (which forces a JSON body) — mirrors customer uploadAvatar.
  campaignSocialPost: (id: string): Promise<CampaignSocialPost> =>
    api.get<any>(`/api/business/campaigns/${id}/social-post/`).then(adaptSocialPost),
  uploadCampaignImage: async (id: string, file: File): Promise<BusinessCampaign> => {
    const form = new FormData();
    form.append("image", file);
    const access = tokenStore.getAccess();
    const headers: Record<string, string> = {};
    if (access) headers["Authorization"] = `Bearer ${access}`;
    // Relative API_URL → same-origin (Next proxy); absolute → direct host.
    const baseUrl = API_URL.startsWith("http") ? API_URL : "";
    const res = await fetch(`${baseUrl}/api/business/campaigns/${id}/image/`, {
      method: "POST",
      headers,
      body: form,
    });
    const json = (await res.json()) as { success?: boolean; data?: any };
    if (!json || json.success === false || !json.data) {
      throw new Error("Campaign image upload failed");
    }
    return adaptBusinessCampaign(json.data);
  },
};

export type BusinessApi = typeof businessApi;
