"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerApi } from "./api";
import type {
  CampaignFeedFilter,
  CampaignListParams,
  NearbyParams,
  ProfilePatch,
  RequestEmailOtpPayload,
} from "./types";

export const qk = {
  me: ["me"] as const,
  myQr: ["my-qr"] as const,
  nearby: (params?: NearbyParams) => ["nearby", params ?? {}] as const,
  categories: ["categories"] as const,
  business: (id: string) => ["business", id] as const,
  qr: (token: string) => ["qr", token] as const,
  campaigns: (params?: CampaignListParams) => ["campaigns", params ?? {}] as const,
  // The {followed, discover} feed, keyed by the discover filter so each filter
  // caches independently (campaigns-restructure design §6).
  campaignFeed: (filter?: CampaignFeedFilter) => ["campaign-feed", filter ?? "all"] as const,
  campaign: (id: string) => ["campaigns", id] as const,
  campaignWallet: ["campaign-wallet"] as const,
  campaignVoucher: (id: string) => ["campaign-vouchers", id] as const,
  groupSession: (id: string) => ["group-sessions", id] as const,
};

// ---- queries ----
export const useMe = (enabled = true) =>
  useQuery({ queryKey: qk.me, queryFn: () => customerApi.me(), enabled, retry: false });

export const useMyQr = (enabled = true, opts?: { refetchInterval?: number }) =>
  useQuery({
    queryKey: qk.myQr,
    queryFn: () => customerApi.myQr(),
    enabled,
    refetchInterval: opts?.refetchInterval,
  });

export const useNearby = (params?: NearbyParams) =>
  useQuery({ queryKey: qk.nearby(params), queryFn: () => customerApi.listNearby(params) });

export const useCategories = () =>
  useQuery({
    queryKey: qk.categories,
    queryFn: () => customerApi.listCategories(),
    // Category enum rarely changes; keep it fresh for a session without refetching.
    staleTime: 60 * 60 * 1000,
  });

export const useBusiness = (id: string) =>
  useQuery({ queryKey: qk.business(id), queryFn: () => customerApi.getBusiness(id), enabled: !!id });

export const useQrResolve = (token: string) =>
  useQuery({ queryKey: qk.qr(token), queryFn: () => customerApi.resolveQr(token), enabled: !!token });

// ---- campaign queries ----
// `params` filters the list server-side (?type / ?joined); it is folded into the
// query key so each filter caches independently. Calling with no args keeps the
// original unfiltered behavior (back-compat).
export const useCampaigns = (
  params?: CampaignListParams,
  opts?: { refetchInterval?: number },
) =>
  useQuery({
    queryKey: qk.campaigns(params),
    queryFn: () => customerApi.listCampaigns(params),
    refetchInterval: opts?.refetchInterval,
  });

// The unified customer campaigns feed (campaigns-restructure design §6): the
// "From places you go" (followed) row + the filterable "Discover more" list.
export const useCampaignFeed = (
  filter?: CampaignFeedFilter,
  opts?: { refetchInterval?: number },
) =>
  useQuery({
    queryKey: qk.campaignFeed(filter),
    queryFn: () => customerApi.campaignFeed(filter),
    refetchInterval: opts?.refetchInterval,
  });

export const useCampaign = (id: string, opts?: { refetchInterval?: number }) =>
  useQuery({
    queryKey: qk.campaign(id),
    queryFn: () => customerApi.getCampaign(id),
    enabled: !!id,
    refetchInterval: opts?.refetchInterval,
  });

export const useCampaignWallet = (opts?: { refetchInterval?: number }) =>
  useQuery({
    queryKey: qk.campaignWallet,
    queryFn: () => customerApi.campaignWallet(),
    refetchInterval: opts?.refetchInterval,
  });

// Voucher view polls so a staff-side redemption flips the customer's screen live.
export const useCampaignVoucher = (id: string, opts?: { refetchInterval?: number }) =>
  useQuery({
    queryKey: qk.campaignVoucher(id),
    queryFn: () => customerApi.getCampaignVoucher(id),
    enabled: !!id,
    refetchInterval: opts?.refetchInterval,
  });

// ---- campaign mutations ----
export const useJoinCampaign = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customerApi.joinCampaign(id),
    onSuccess: (campaign) => {
      qc.setQueryData(qk.campaign(campaign.id), campaign);
      // Prefix-match invalidates every filtered campaigns list + feed at once.
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign-feed"] });
    },
  });
};

export const usePresentVoucher = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customerApi.presentCampaignVoucher(id),
    onSuccess: (voucher) => {
      qc.setQueryData(qk.campaignVoucher(voucher.id), voucher);
      qc.invalidateQueries({ queryKey: qk.campaignWallet });
    },
  });
};

export const useStartGroupSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignId: string) => customerApi.startGroupSession(campaignId),
    onSuccess: (session) => {
      qc.setQueryData(qk.groupSession(session.id), session);
    },
  });
};

export const useInviteToGroupSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customerApi.inviteToGroupSession(id),
    onSuccess: (session) => {
      qc.setQueryData(qk.groupSession(session.id), session);
    },
  });
};

// ---- mutations ----
export const useRequestOtp = () =>
  useMutation({ mutationFn: (phone: string) => customerApi.requestOtp(phone) });

export const useVerifyOtp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ phone, code }: { phone: string; code: string }) =>
      customerApi.verifyOtp(phone, code),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
};

export const usePasswordLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      customerApi.passwordLogin(email, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
};

export const useRequestPasswordReset = () =>
  useMutation({ mutationFn: (email: string) => customerApi.requestPasswordReset(email) });

export const useResetPassword = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, code, newPassword }: { email: string; code: string; newPassword: string }) =>
      customerApi.resetPassword(email, code, newPassword),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
};

export const useRequestEmailOtp = () =>
  useMutation({
    mutationFn: (payload: RequestEmailOtpPayload) => customerApi.requestEmailOtp(payload),
  });

export const useVerifyEmailOtp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) =>
      customerApi.verifyEmailOtp(email, code),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
};

export const useUpdateProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) => customerApi.updateProfile(patch),
    // Refetch the full Me — the PATCH response only carries `user`, so writing it
    // into the cache directly would drop `area`/`staff` and eject staff users.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
};

export const useUploadAvatar = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => customerApi.uploadAvatar(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
};

