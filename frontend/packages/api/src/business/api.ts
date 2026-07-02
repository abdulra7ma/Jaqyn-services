// Business API layer — wired live to the backend (envelope unwrapped by client,
// lists arrive as {results:[…]}). Screens consume only the hooks in ./hooks.
// Campaign methods (apps.campaigns) map raw rows through ./adapters.
import { API_URL, api } from "../client";
import { tokenStore } from "../tokens";
import {
  adaptBusinessCampaign,
  adaptCampaignDetailTabs,
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
  BusinessCampaignListParams,
  BusinessCampaignListResponse,
  BusinessProfile,
  BusinessRegisterPayload,
  BusinessReport,
  BusinessType,
  CampaignDetailTabs,
  CampaignLifecycleAction,
  CampaignParticipantRow,
  CampaignPayload,
  CampaignSocialPost,
  CampaignVoucherRow,
  CatalogItem,
  CatalogItemPayload,
  CreateStaffPayload,
  CreateStaffResult,
  Dashboard,
  GalleryImage,
  InviteValidation,
  MaskedCustomer,
  MerchantQr,
  OnboardingProfilePatch,
  OnboardingState,
  ReportPeriod,
  ReportRange,
  StaffInvite,
  StaffInviteList,
  StaffInvitePayload,
  StaffPasswordReset,
  TeamList,
  TeamRole,
  TeamRow,
} from "./types";

type Paginated<T> = { results: T[] };

function queryString(params?: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// Shared multipart upload for the brand/background images. The backend expects
// the file under the `image` field and returns the owner business in the
// {success,data} envelope (same as uploadCampaignImage).
async function uploadBusinessImage(path: string, file: File): Promise<BusinessProfile> {
  const form = new FormData();
  form.append("image", file);
  const access = tokenStore.getAccess();
  const headers: Record<string, string> = {};
  if (access) headers["Authorization"] = `Bearer ${access}`;
  // Relative API_URL → same-origin (Next proxy); absolute → direct host.
  const baseUrl = API_URL.startsWith("http") ? API_URL : "";
  const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body: form });
  const json = (await res.json()) as { success?: boolean; data?: BusinessProfile };
  if (!json || json.success === false || !json.data) {
    throw new Error("Business image upload failed");
  }
  return json.data;
}

export const businessApi = {
  register: (payload: BusinessRegisterPayload) =>
    api.post<BusinessProfile>("/api/business/register/", payload),
  me: () => api.get<BusinessProfile>("/api/business/me/"),
  // Brand image (logo) + background image (cover) uploads. Multipart, so they
  // bypass the JSON `api` client (which forces a JSON body) — same pattern as
  // customer uploadAvatar / uploadCampaignImage. Both return the owner business.
  uploadLogo: (file: File) => uploadBusinessImage("/api/business/profile/logo/", file),
  uploadCover: (file: File) => uploadBusinessImage("/api/business/profile/cover/", file),
  updateMe: (patch: Omit<Partial<BusinessProfile>, "working_hours"> & { working_hours?: unknown }) =>
    api.patch<BusinessProfile>("/api/business/me/", patch),
  setOwnerStaff: (enabled: boolean) =>
    api.post<BusinessProfile>("/api/business/owner-staff/", { enabled }),
  dashboard: () => api.get<Dashboard>("/api/business/dashboard/"),
  qr: () => api.get<MerchantQr>("/api/business/qr/"),
  regenerateApprovalCode: () =>
    api.post<ApprovalCode>("/api/business/approval-code/regenerate/"),

  reports: (period: ReportPeriod = "month", range?: ReportRange) => {
    const params = new URLSearchParams({ period });
    if (period === "custom" && range) {
      params.set("date_from", range.date_from);
      params.set("date_to", range.date_to);
    }
    return api.get<BusinessReport>(`/api/business/reports/?${params.toString()}`);
  },
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

  // Multipart POST to attach an image to a catalog item (product/service/menu entry).
  // Field name `image`; throttle scope `business_image`. Returns the updated item.
  uploadCatalogItemImage: async (id: string, file: File): Promise<CatalogItem> => {
    const form = new FormData();
    form.append("image", file);
    const access = tokenStore.getAccess();
    const headers: Record<string, string> = {};
    if (access) headers["Authorization"] = `Bearer ${access}`;
    const baseUrl = API_URL.startsWith("http") ? API_URL : "";
    const res = await fetch(`${baseUrl}/api/business/catalog-items/${id}/image/`, {
      method: "POST",
      headers,
      body: form,
    });
    const json = (await res.json()) as { success?: boolean; data?: CatalogItem };
    if (!json || json.success === false || !json.data) {
      throw new Error("Catalog item image upload failed");
    }
    return json.data;
  },

  // ---- business gallery (cap 8 photos, /api/business/gallery/) ----

  // GET /api/business/gallery/ → { results: GalleryImage[] }
  listGallery: (): Promise<GalleryImage[]> =>
    api.get<Paginated<GalleryImage>>("/api/business/gallery/").then((d) => d.results),

  // Multipart POST to add a gallery photo. Field name `image`; throttle scope
  // `business_image`. 409 GALLERY_LIMIT_REACHED when the business already has 8.
  uploadGalleryImage: async (file: File): Promise<GalleryImage> => {
    const form = new FormData();
    form.append("image", file);
    const access = tokenStore.getAccess();
    const headers: Record<string, string> = {};
    if (access) headers["Authorization"] = `Bearer ${access}`;
    const baseUrl = API_URL.startsWith("http") ? API_URL : "";
    const res = await fetch(`${baseUrl}/api/business/gallery/`, {
      method: "POST",
      headers,
      body: form,
    });
    const json = (await res.json()) as { success?: boolean; data?: GalleryImage };
    if (!json || json.success === false || !json.data) {
      throw new Error("Gallery image upload failed");
    }
    return json.data;
  },

  // DELETE /api/business/gallery/{id}/ → success envelope (void).
  deleteGalleryImage: (id: string): Promise<void> =>
    api.delete<unknown>(`/api/business/gallery/${id}/`).then(() => undefined),

  listStaffInvites: () => api.get<StaffInviteList>("/api/business/staff-invites/"),
  addStaffInvite: (payload: StaffInvitePayload) =>
    api.post<StaffInvite>("/api/business/staff-invites/", payload),
  removeStaffInvite: (id: string) => api.delete<unknown>(`/api/business/staff-invites/${id}/`),

  // ---- team / manage staff (GET /api/business/staff/) ----
  team: () => api.get<TeamList>("/api/business/staff/"),
  staffMember: (id: string) => api.get<TeamRow>(`/api/business/staff/${id}/`),
  updateStaffRole: (id: string, role: TeamRole) =>
    api.patch<TeamRow>(`/api/business/staff/${id}/`, { role }),
  suspendStaff: (id: string) => api.post<TeamRow>(`/api/business/staff/${id}/suspend/`),
  reactivateStaff: (id: string) => api.post<TeamRow>(`/api/business/staff/${id}/reactivate/`),
  resetStaffPassword: (id: string) =>
    api.post<StaffPasswordReset>(`/api/business/staff/${id}/reset-password/`),
  removeStaffMember: (id: string) => api.delete<unknown>(`/api/business/staff/${id}/`),
  createStaffAccount: (p: CreateStaffPayload) =>
    api.post<CreateStaffResult>("/api/business/staff/", p),

  // ---- campaigns (apps.campaigns — plan §1.3) ----
  // List supports ?type=individual|group|social & ?status=active|draft|completed
  // (campaigns-restructure design §5).
  listCampaigns: (params?: BusinessCampaignListParams): Promise<BusinessCampaignListResponse> =>
    api.get<any>(`/api/business/campaigns/${queryString(params)}`).then(adaptCampaignList),
  // Detail returns the tabbed payload (overview/settings/participants/reward_usage/
  // groups/analytics) — campaigns-restructure design §5.
  getCampaign: (id: string): Promise<CampaignDetailTabs> =>
    api.get<any>(`/api/business/campaigns/${id}/`).then(adaptCampaignDetailTabs),
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
