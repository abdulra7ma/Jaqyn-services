// Business API layer — wired live to the backend (envelope unwrapped by client,
// lists arrive as {results:[…]}). Screens consume only the hooks in ./hooks.
import { api } from "../client";
import type {
  ActivateResponse,
  ApprovalCode,
  BusinessGroupDeal,
  BusinessProfile,
  BusinessRegisterPayload,
  BusinessType,
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
};

export type BusinessApi = typeof businessApi;
