// Staff API layer — wired live to the backend. Auth is the unified session
// (phone+OTP or email+password via /api/auth/); staff identity comes from /me.
// Campaign-aware scan methods (apps.campaigns) map raw rows through ./adapters.
import { api } from "../client";
import { ApiClientError } from "../errors";
import { tokenStore } from "../tokens";
import { session } from "../customer/session";
import {
  adaptConfirmVisitResult,
  adaptRedeemResult,
  adaptScanCustomerResult,
  adaptScanDispatch,
  adaptUnifiedScan,
  adaptVoucherScanResult,
} from "./adapters";
import type {
  CampaignVoucherScanResult,
  CampaignVoucherScanState,
  ConfirmGroupResult,
  ConfirmSocialResult,
  RecentActivity,
  RedeemCampaignVoucherResult,
  ScanCustomerResult,
  ScanDispatchResult,
  ScanResult,
  UnifiedScanResult,
  StaffRedemption,
  TodayCode,
} from "./types";

// A voucher-scan error code (raised by validate_reward_voucher) → the invalid
// state the design's voucher sheet renders. Anything not in this map is a real
// failure that re-throws to the screen's generic error sheet.
const VOUCHER_SCAN_STATE: Record<string, CampaignVoucherScanState> = {
  VOUCHER_NOT_FOUND: "not_found",
  VOUCHER_ALREADY_REDEEMED: "redeemed",
  VOUCHER_EXPIRED: "expired",
  VOUCHER_CANCELLED: "cancelled",
  VOUCHER_NOT_ACTIVE: "expired",
  WRONG_BUSINESS: "not_found",
};

export const staffApi = {
  logout() {
    tokenStore.clear();
    session.clear();
  },
  todayCode: () => api.get<TodayCode>("/api/staff/today-code/"),
  scan: (token: string) => api.post<ScanResult>("/api/staff/scan/", { token }),
  redeem: (body: { code?: string; token?: string }) =>
    api.post<StaffRedemption>("/api/staff/redeem/", body),
  redeemManual: (code: string) =>
    api.post<StaffRedemption>("/api/staff/redeem/manual-code/", { code }),
  recentActivity: () => api.get<RecentActivity>("/api/staff/recent-activity/"),

  // ---- campaign-aware scan (apps.campaigns — plan §3) ----
  scanCustomerForCampaigns: (token: string): Promise<ScanCustomerResult> =>
    api
      .post<any>("/api/staff/campaigns/scan-customer/", { token })
      .then(adaptScanCustomerResult),
  // Read-only resolve of a scanned token → which preview to open. One round-trip
  // replaces the old visit/redeem mode toggle; no writes happen here.
  resolveScan: (token: string): Promise<ScanDispatchResult> =>
    api.post<any>("/api/staff/campaigns/scan/", { token }).then(adaptScanDispatch),
  // One confirm advances BOTH the regular loyalty card and the prioritized
  // eligible campaign. Omit campaign_id to let the backend auto-pick. The backend
  // returns 200 even when one (or neither) leg advanced; only an invalid token
  // errors. Maps the raw two-leg envelope through adaptUnifiedScan.
  confirmVisitUnified: (token: string, campaignId?: string): Promise<UnifiedScanResult> =>
    api
      .post<any>("/api/staff/campaigns/visit/", {
        token,
        ...(campaignId ? { campaign_id: campaignId } : {}),
      })
      .then(adaptUnifiedScan),
  async scanCampaignVoucher(token: string): Promise<CampaignVoucherScanResult> {
    // A valid voucher resolves to the voucher object; the backend raises a typed
    // error for an invalid one. Map the known voucher-error codes to the design's
    // invalid-voucher states so the screen shows the right sheet instead of a
    // generic error; re-throw anything else.
    try {
      const raw = await api.post<any>("/api/staff/campaigns/scan-voucher/", { token });
      return adaptVoucherScanResult(raw);
    } catch (error) {
      if (error instanceof ApiClientError && error.code in VOUCHER_SCAN_STATE) {
        return {
          state: VOUCHER_SCAN_STATE[error.code]!,
          voucher_id: null,
          customer_name: null,
          campaign_name: null,
          reward_title: null,
          expires_label: null,
          code: null,
          reason: error.message,
          group: null,
        };
      }
      throw error;
    }
  },
  // Redeem by the voucher code carried on the scan result — the backend redeem
  // endpoint accepts a token or a code, and the code is the stable identifier the
  // scan surfaces (the voucher *id* is not a redeem key).
  redeemCampaignVoucher: (code: string): Promise<RedeemCampaignVoucherResult> =>
    api.post<any>("/api/staff/campaigns/redeem-voucher/", { code }).then(adaptRedeemResult),
  confirmGroup: (sessionId: string): Promise<ConfirmGroupResult> =>
    api.post<ConfirmGroupResult>("/api/staff/campaigns/confirm-group/", {
      group_session_id: sessionId,
    }),
  // Verify a SOCIAL campaign proof → mint the voucher (campaigns-restructure
  // design §5). Staff scans the customer's QR (token) and selects the SOCIAL
  // campaign. Returns the ProgressResult-shaped confirm payload (campaign + voucher).
  confirmSocial: (token: string, campaignId: string): Promise<ConfirmSocialResult> =>
    api
      .post<any>("/api/staff/campaigns/confirm-social/", { token, campaign_id: campaignId })
      .then(adaptConfirmVisitResult),
};

export type StaffApi = typeof staffApi;
