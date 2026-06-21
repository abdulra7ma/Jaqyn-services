// Staff API layer — wired live to the backend. Auth is the unified session
// (phone+OTP or email+password via /api/auth/); staff identity comes from /me.
import { api } from "../client";
import { tokenStore } from "../tokens";
import { session } from "../customer/session";
import type {
  RecentActivity,
  ScanResult,
  StaffCollectResult,
  StaffGroup,
  StaffProgram,
  StaffRedemption,
  TodayCode,
} from "./types";

type Paginated<T> = { results: T[] };

export const staffApi = {
  logout() {
    tokenStore.clear();
    session.clear();
  },
  programs: () => api.get<{ programs: StaffProgram[] }>("/api/staff/programs/"),
  todayCode: () => api.get<TodayCode>("/api/staff/today-code/"),
  scan: (token: string) => api.post<ScanResult>("/api/staff/scan/", { token }),
  redeem: (body: { code?: string; token?: string }) =>
    api.post<StaffRedemption>("/api/staff/redeem/", body),
  redeemManual: (code: string) =>
    api.post<StaffRedemption>("/api/staff/redeem/manual-code/", { code }),
  recentActivity: () => api.get<RecentActivity>("/api/staff/recent-activity/"),
  listGroups: () =>
    api.get<Paginated<StaffGroup>>("/api/staff/groups/").then((d) => d.results),
  verifyGroup: (id: string) => api.post<StaffGroup>(`/api/staff/groups/${id}/verify/`),
  redeemGroup: (id: string) => api.post<StaffGroup>(`/api/staff/groups/${id}/redeem/`),
  collect: (body: { token: string; amount?: number; program_id?: string }) =>
    api.post<StaffCollectResult>("/api/staff/collect/", body),
};

export type StaffApi = typeof staffApi;
