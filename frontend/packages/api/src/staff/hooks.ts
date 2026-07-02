"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "./api";
import { qk } from "../customer/hooks";
import type { ActivityEventKind } from "./types";

export const sqk = {
  todayCode: ["staff", "today-code"] as const,
  // ponytail: prefix ["staff","activity"] is the invalidation key; callers that
  // invalidate sqk.activity invalidate ALL kind variants via prefix matching.
  activityPrefix: ["staff", "activity"] as const,
  activity: (kind?: ActivityEventKind) =>
    ["staff", "activity", kind ?? "all"] as const,
  stats: ["staff", "stats"] as const,
};

export const useTodayCode = (enabled = true) =>
  useQuery({ queryKey: sqk.todayCode, queryFn: () => staffApi.todayCode(), enabled });
export const useStaffStats = (enabled = true) =>
  useQuery({ queryKey: sqk.stats, queryFn: () => staffApi.stats(), enabled });
export const useRecentActivity = (enabled = true, kind?: ActivityEventKind) =>
  useQuery({
    queryKey: sqk.activity(kind),
    queryFn: () => staffApi.recentActivity(kind),
    enabled,
  });

export const useStaffScan = () =>
  useMutation({ mutationFn: (token: string) => staffApi.scan(token) });

// First-login profile completion. Invalidates the shared `me` query so the
// StaffShell gate re-reads profile_completed and stops redirecting to onboarding.
export const useCompleteStaffProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; new_password: string }) => staffApi.completeProfile(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
};

export const useStaffRedeem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code?: string; token?: string }) => staffApi.redeem(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activityPrefix }),
  });
};

export const useStaffRedeemManual = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => staffApi.redeemManual(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activityPrefix }),
  });
};

// ---- campaign-aware scan (apps.campaigns — plan §3) ----

export const useScanCustomerForCampaigns = () =>
  useMutation({ mutationFn: (token: string) => staffApi.scanCustomerForCampaigns(token) });

export const useResolveScan = () =>
  useMutation({ mutationFn: (token: string) => staffApi.resolveScan(token) });

// Confirm ONE chosen program toward the customer. `amount` is the bill in som,
// required for spend / spend-basis points, ignored otherwise.
export const useConfirmVisitUnified = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { token: string; campaignId?: string; amount?: string }) =>
      staffApi.confirmVisitUnified(body.token, body.campaignId, body.amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activityPrefix }),
  });
};

export const useScanCampaignVoucher = () =>
  useMutation({ mutationFn: (token: string) => staffApi.scanCampaignVoucher(token) });

export const useRedeemCampaignVoucher = () => {
  const qc = useQueryClient();
  return useMutation({
    // Redeems by the voucher code surfaced on the scan result (the backend redeem
    // endpoint keys on token/code, not the voucher id).
    mutationFn: (code: string) => staffApi.redeemCampaignVoucher(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activityPrefix }),
  });
};

// Redeem a voucher by its id + source — used from the chooser-sheet redeem
// entry when active_vouchers is present in the scan-customer response (B2).
export const useRedeemVoucherById = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (voucher: { id: string; source: "campaign" | "loyalty" }) =>
      staffApi.redeemVoucherById(voucher),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activityPrefix }),
  });
};

export const useConfirmGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => staffApi.confirmGroup(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activityPrefix }),
  });
};

// Verify a SOCIAL campaign proof → mint the voucher (campaigns-restructure §5).
export const useConfirmSocial = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { token: string; campaignId: string }) =>
      staffApi.confirmSocial(body.token, body.campaignId),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activityPrefix }),
  });
};
