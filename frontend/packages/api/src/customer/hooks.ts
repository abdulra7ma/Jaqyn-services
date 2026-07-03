"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customerApi } from "./api";
import type {
  CampaignFeedFilter,
  CampaignFeedParams,
  CampaignListParams,
  NearbyParams,
  ProfilePatch,
  RequestEmailOtpPayload,
  StartGroupSessionInput,
} from "./types";

export const qk = {
  me: ["me"] as const,
  myQr: ["my-qr"] as const,
  nearby: (params?: NearbyParams) => ["nearby", params ?? {}] as const,
  categories: ["categories"] as const,
  business: (id: string) => ["business", id] as const,
  qr: (token: string) => ["qr", token] as const,
  campaigns: (params?: CampaignListParams) => ["campaigns", params ?? {}] as const,
  // The {followed, discover, sections} feed. Keyed by filter + search params so
  // each combination caches independently (campaigns-restructure §6 + redesign B).
  campaignFeed: (filter?: CampaignFeedFilter, params?: CampaignFeedParams) =>
    ["campaign-feed", filter ?? "all", params ?? {}] as const,
  // Patches summary (campaigns redesign §A). Single key — no per-user variance
  // beyond auth (auth is enforced by the API client).
  patches: ["patches"] as const,
  campaignNotices: ["campaign-notices"] as const,
  campaign: (id: string) => ["campaigns", id] as const,
  campaignWallet: ["campaign-wallet"] as const,
  campaignVoucher: (id: string) => ["campaign-vouchers", id] as const,
  // The pick-from-menu catalog for a campaign's item reward (multi-form-loyalty §3).
  campaignCatalog: (id: string) => ["campaign-catalog", id] as const,
  groupSession: (id: string) => ["group-sessions", id] as const,
  myGroups: ["my-groups-list"] as const,
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

export const useNearby = (params?: NearbyParams, opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: qk.nearby(params),
    queryFn: () => customerApi.listNearby(params),
    enabled: opts?.enabled ?? true,
  });

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

// The unified customer campaigns feed (campaigns-restructure design §6 + redesign B).
// `filter` drives the followed/discover split; `params` (q, category) narrow
// discover results + sections for the discover page.
export const useCampaignFeed = (
  filter?: CampaignFeedFilter,
  params?: CampaignFeedParams,
  opts?: { refetchInterval?: number },
) =>
  useQuery({
    queryKey: qk.campaignFeed(filter, params),
    queryFn: () => customerApi.campaignFeed(filter, params),
    refetchInterval: opts?.refetchInterval,
  });

export const useCampaignNotices = () =>
  useQuery({
    queryKey: qk.campaignNotices,
    queryFn: () => customerApi.campaignNotices(),
  });

export const useMarkCampaignNoticesSeen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => customerApi.markCampaignNoticesSeen(ids),
    onSuccess: (_result, ids) => {
      qc.setQueryData(
        qk.campaignNotices,
        (current: import("./types").CampaignNotice[] | undefined) =>
          current?.filter((notice) => !ids.includes(notice.id)) ?? [],
      );
    },
  });
};

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

// The catalog items a customer can pick for an item voucher (multi-form-loyalty
// slice 3). Only fetched when a sheet asks for it (enabled flag).
export const useCampaignCatalog = (campaignId: string, enabled = true) =>
  useQuery({
    queryKey: qk.campaignCatalog(campaignId),
    queryFn: () => customerApi.campaignCatalog(campaignId),
    enabled: enabled && !!campaignId,
  });

// Poll the live group session so demo-fill / real joins reflect without a manual
// refetch (mirrors the detail page's live polling).
export const useGroupSession = (id: string, opts?: { refetchInterval?: number }) =>
  useQuery({
    queryKey: qk.groupSession(id),
    queryFn: () => customerApi.getGroupSession(id),
    enabled: !!id,
    refetchInterval: opts?.refetchInterval,
  });

// The customer's own groups. Used to (a) surface the "Your active group" feed
// banner and (b) find an existing active group for a campaign so the group route
// renders the forming view instead of the create form.
export const useMyGroups = (opts?: { refetchInterval?: number }) =>
  useQuery({
    queryKey: qk.myGroups,
    queryFn: () => customerApi.listMyGroups(),
    refetchInterval: opts?.refetchInterval,
  });

// ---- patches (campaigns redesign §A) ----

// Patches summary: earned count, next-patch track, unseen (earn-moment), all rows.
// Refetched whenever the campaigns tab mounts so earn moments show promptly.
export const usePatches = (opts?: { refetchInterval?: number }) =>
  useQuery({
    queryKey: qk.patches,
    queryFn: () => customerApi.patches(),
    refetchInterval: opts?.refetchInterval,
  });

// Mark earn-moment shown for the given patch slugs. Clears unseen_earned on the
// server; invalidate patches to reflect the cleared list.
export const useMarkPatchesSeen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slugs: string[]) => customerApi.markPatchesSeen(slugs),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.patches }),
  });
};

// Dismiss the NEW pill on the patches row by recording the first board visit.
// Invalidate patches so board_seen flips true client-side without a reload.
export const useMarkPatchBoardSeen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => customerApi.markPatchBoardSeen(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.patches }),
  });
};

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

// Resolve a customer-choice item voucher (multi-form-loyalty slice 3). The
// voucher now carries its catalog_item, so update its cache + the wallet.
export const useSelectCampaignVoucherItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ voucherId, catalogItemId }: { voucherId: string; catalogItemId: string }) =>
      customerApi.selectVoucherItem(voucherId, catalogItemId),
    onSuccess: (voucher) => {
      qc.setQueryData(qk.campaignVoucher(voucher.id), voucher);
      qc.invalidateQueries({ queryKey: qk.campaignWallet });
    },
  });
};

export const useStartGroupSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartGroupSessionInput) => customerApi.startGroupSession(input),
    onSuccess: (session) => {
      qc.setQueryData(qk.groupSession(session.id), session);
      // A new/updated group changes the my-groups list (feed banner + lookup).
      qc.invalidateQueries({ queryKey: qk.myGroups });
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

export const useLeaveGroupSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customerApi.leaveGroupSession(id),
    onSuccess: (_res, id) => {
      qc.removeQueries({ queryKey: qk.groupSession(id) });
      qc.invalidateQueries({ queryKey: qk.myGroups });
    },
  });
};

// DEV/testing aid: backend gates this on DEBUG and 403s in prod.
export const useDemoFillGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => customerApi.demoFillGroup(id),
    onSuccess: (session) => {
      qc.setQueryData(qk.groupSession(session.id), session);
      qc.invalidateQueries({ queryKey: qk.myGroups });
    },
  });
};

// ---- mutations ----
export const useRequestOtp = () =>
  useMutation({ mutationFn: (phone: string) => customerApi.requestOtp(phone) });

export const useLoginResolve = () =>
  useMutation({ mutationFn: (identifier: string) => customerApi.loginResolve(identifier) });

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
    mutationFn: ({ identifier, password }: { identifier: string; password: string }) =>
      customerApi.passwordLogin(identifier, password),
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
