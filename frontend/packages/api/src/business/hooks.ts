"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { businessApi } from "./api";
import type {
  BusinessRegisterPayload,
  CampaignLifecycleAction,
  CampaignPayload,
  CatalogItemPayload,
  GroupOfferPayload,
  OnboardingProfilePatch,
  RewardProgramPayload,
  StaffInvitePayload,
} from "./types";

export const bqk = {
  me: ["business", "me"] as const,
  dashboard: ["business", "dashboard"] as const,
  qr: ["business", "qr"] as const,
  rewards: ["business", "rewards"] as const,
  reward: (id: string) => ["business", "rewards", id] as const,
  offers: ["business", "offers"] as const,
  reports: ["business", "reports"] as const,
  customers: ["business", "customers"] as const,
  types: ["business", "types"] as const,
  onboarding: ["business", "onboarding"] as const,
  catalog: ["business", "catalog"] as const,
  staffInvites: ["business", "staff-invites"] as const,
  campaigns: ["business", "campaigns"] as const,
  campaign: (id: string) => ["business", "campaigns", id] as const,
  campaignParticipants: (id: string) => ["business", "campaigns", id, "participants"] as const,
  campaignVouchers: (id: string) => ["business", "campaigns", id, "vouchers"] as const,
  campaignAnalytics: (id: string) => ["business", "campaigns", id, "analytics"] as const,
};

export const useBusinessMe = (enabled = true) =>
  useQuery({ queryKey: bqk.me, queryFn: () => businessApi.me(), enabled, retry: false });
export const useDashboard = (enabled = true) =>
  useQuery({ queryKey: bqk.dashboard, queryFn: () => businessApi.dashboard(), enabled, retry: false });
export const useMerchantQr = (enabled = true) =>
  useQuery({ queryKey: bqk.qr, queryFn: () => businessApi.qr(), enabled });
export const useBusinessRewards = () =>
  useQuery({ queryKey: bqk.rewards, queryFn: () => businessApi.listRewards() });
export const useBusinessReward = (id: string) =>
  useQuery({ queryKey: bqk.reward(id), queryFn: () => businessApi.getReward(id), enabled: !!id });
export const useBusinessOffers = () =>
  useQuery({ queryKey: bqk.offers, queryFn: () => businessApi.listOffers() });
export const useBusinessGroupDeals = (enabled = true) =>
  useQuery({ queryKey: ["business", "group-deals"], queryFn: () => businessApi.listGroupDeals(), enabled });
export const useBusinessReports = () =>
  useQuery({ queryKey: bqk.reports, queryFn: () => businessApi.reports() });
export const useBusinessCustomers = () =>
  useQuery({ queryKey: bqk.customers, queryFn: () => businessApi.customers() });

export const useRegisterBusiness = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: BusinessRegisterPayload) => businessApi.register(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.me }),
  });
};
export const useUpdateBusiness = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof businessApi.updateMe>[0]) => businessApi.updateMe(patch),
    onSuccess: (b) => {
      qc.setQueryData(bqk.me, b);
      qc.invalidateQueries({ queryKey: bqk.onboarding });
    },
  });
};
export const useRegenerateApprovalCode = () =>
  useMutation({ mutationFn: () => businessApi.regenerateApprovalCode() });

export const useCreateReward = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: RewardProgramPayload) => businessApi.createReward(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.rewards }),
  });
};
export const useToggleReward = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? businessApi.activateReward(id) : businessApi.pauseReward(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.rewards }),
  });
};
export const useUpdateReward = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RewardProgramPayload> }) =>
      businessApi.updateReward(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.rewards }),
  });
};

export const useCreateOffer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: GroupOfferPayload) => businessApi.createOffer(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.offers }),
  });
};
export const useUpdateOffer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<GroupOfferPayload> }) =>
      businessApi.updateOffer(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.offers }),
  });
};
export const useDeleteOffer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => businessApi.deleteOffer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.offers }),
  });
};
export const useOfferAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "submit" | "pause" | "activate" }) =>
      action === "submit"
        ? businessApi.submitOffer(id)
        : action === "pause"
          ? businessApi.pauseOffer(id)
          : businessApi.activateOffer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.offers }),
  });
};

// ---- onboarding ----

export const useBusinessTypes = () =>
  useQuery({ queryKey: bqk.types, queryFn: () => businessApi.businessTypes(), staleTime: 5 * 60_000 });

export const useOnboardingState = (enabled = true) =>
  useQuery({ queryKey: bqk.onboarding, queryFn: () => businessApi.onboarding(), enabled, retry: false });

export const useSaveOnboarding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: OnboardingProfilePatch) => businessApi.saveOnboarding(patch),
    onSuccess: (res) => {
      qc.setQueryData(bqk.me, res.business);
      qc.invalidateQueries({ queryKey: bqk.onboarding });
    },
  });
};

export const useSubmitOnboarding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => businessApi.submitOnboarding(),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.onboarding }),
  });
};

export const useActivateInvite = () =>
  useMutation({
    mutationFn: (body: { token: string; full_name: string; password: string }) =>
      businessApi.activateInvite(body),
  });

export const useCatalog = (enabled = true) =>
  useQuery({ queryKey: bqk.catalog, queryFn: () => businessApi.listCatalog(), enabled });

export const useAddCatalogItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CatalogItemPayload) => businessApi.addCatalogItem(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bqk.catalog });
      qc.invalidateQueries({ queryKey: bqk.onboarding });
    },
  });
};

export const useRemoveCatalogItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => businessApi.removeCatalogItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: bqk.catalog });
      qc.invalidateQueries({ queryKey: bqk.onboarding });
    },
  });
};

export const useStaffInvites = (enabled = true) =>
  useQuery({ queryKey: bqk.staffInvites, queryFn: () => businessApi.listStaffInvites(), enabled });

export const useAddStaffInvite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: StaffInvitePayload) => businessApi.addStaffInvite(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.staffInvites }),
  });
};

export const useRemoveStaffInvite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => businessApi.removeStaffInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.staffInvites }),
  });
};

// ---- campaigns (apps.campaigns — plan §1.3) ----

export const useBusinessCampaigns = (enabled = true) =>
  useQuery({ queryKey: bqk.campaigns, queryFn: () => businessApi.listCampaigns(), enabled });

export const useBusinessCampaign = (id: string) =>
  useQuery({ queryKey: bqk.campaign(id), queryFn: () => businessApi.getCampaign(id), enabled: !!id });

export const useCampaignParticipants = (id: string, enabled = true) =>
  useQuery({
    queryKey: bqk.campaignParticipants(id),
    queryFn: () => businessApi.campaignParticipants(id),
    enabled: enabled && !!id,
  });

export const useCampaignVouchers = (id: string, enabled = true) =>
  useQuery({
    queryKey: bqk.campaignVouchers(id),
    queryFn: () => businessApi.campaignVouchers(id),
    enabled: enabled && !!id,
  });

export const useCampaignAnalytics = (id: string, enabled = true) =>
  useQuery({
    queryKey: bqk.campaignAnalytics(id),
    queryFn: () => businessApi.campaignAnalytics(id),
    enabled: enabled && !!id,
  });

export const useCreateCampaign = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: CampaignPayload) => businessApi.createCampaign(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.campaigns }),
  });
};

export const useUpdateCampaign = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CampaignPayload> }) =>
      businessApi.updateCampaign(id, patch),
    onSuccess: (c) => {
      qc.setQueryData(bqk.campaign(c.id), c);
      qc.invalidateQueries({ queryKey: bqk.campaigns });
    },
  });
};

export const useCampaignAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: CampaignLifecycleAction }) =>
      businessApi.campaignAction(id, action),
    onSuccess: (c) => {
      qc.setQueryData(bqk.campaign(c.id), c);
      qc.invalidateQueries({ queryKey: bqk.campaigns });
    },
  });
};

export const useDuplicateCampaign = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => businessApi.duplicateCampaign(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: bqk.campaigns }),
  });
};

export const useCancelCampaignVoucher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      businessApi.cancelCampaignVoucher(id, reason),
    onSuccess: (_v, vars) => {
      // We don't know the campaign id here; invalidate all voucher lists.
      qc.invalidateQueries({ queryKey: ["business", "campaigns"], predicate: (q) => q.queryKey.includes("vouchers") });
      void vars;
    },
  });
};
