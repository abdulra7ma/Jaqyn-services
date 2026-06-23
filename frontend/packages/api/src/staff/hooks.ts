"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "./api";

export const sqk = {
  todayCode: ["staff", "today-code"] as const,
  activity: ["staff", "activity"] as const,
  groups: ["staff", "groups"] as const,
  programs: ["staff", "programs"] as const,
};

export const useStaffPrograms = (enabled = true) =>
  useQuery({ queryKey: sqk.programs, queryFn: () => staffApi.programs(), enabled });
export const useTodayCode = (enabled = true) =>
  useQuery({ queryKey: sqk.todayCode, queryFn: () => staffApi.todayCode(), enabled });
export const useRecentActivity = (enabled = true) =>
  useQuery({ queryKey: sqk.activity, queryFn: () => staffApi.recentActivity(), enabled });
export const useStaffGroups = (enabled = true) =>
  useQuery({ queryKey: sqk.groups, queryFn: () => staffApi.listGroups(), enabled });

export const useStaffScan = () =>
  useMutation({ mutationFn: (token: string) => staffApi.scan(token) });

export const useStaffRedeem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code?: string; token?: string }) => staffApi.redeem(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activity }),
  });
};

export const useStaffRedeemManual = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => staffApi.redeemManual(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activity }),
  });
};

export const useVerifyGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => staffApi.verifyGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.groups }),
  });
};

export const useRedeemGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => staffApi.redeemGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.groups }),
  });
};

export const useStaffCollect = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { token: string; amount?: number; program_id?: string }) =>
      staffApi.collect(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activity }),
  });
};

// ---- campaign-aware scan (apps.campaigns — plan §3) ----

export const useScanCustomerForCampaigns = () =>
  useMutation({ mutationFn: (token: string) => staffApi.scanCustomerForCampaigns(token) });

export const useConfirmVisit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { token: string; campaign_id: string }) => staffApi.confirmVisit(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activity }),
  });
};

// One confirm advances both the loyalty card and the prioritized campaign.
export const useConfirmVisitUnified = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { token: string; campaignId?: string }) =>
      staffApi.confirmVisitUnified(body.token, body.campaignId),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activity }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.activity }),
  });
};

export const useConfirmGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => staffApi.confirmGroup(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: sqk.groups }),
  });
};
