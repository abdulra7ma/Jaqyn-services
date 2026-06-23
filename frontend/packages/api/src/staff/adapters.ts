// Boundary adapters for the campaign-aware staff scanner (apps.campaigns).
//
// The backend staff endpoints return the campaigns serializers verbatim
// (CustomerScanResultSerializer / ProgressResultSerializer / the voucher
// serializer), whose shapes differ from the result types the scan screen renders.
// These functions map the raw envelope-unwrapped rows into the staff UI domain
// types so the screen stays decoupled from the backend shape — the codebase's
// adapter idiom (see customer/adapters.ts, business/adapters.ts).
//
// Field gaps the backend genuinely does not expose are filled with safe defaults
// the screen tolerates (it renders empty strings without crashing):
//   • customer phone — CustomerScanResultSerializer flattens customer to id+name.
//   • customer_name on a confirm-visit / redeem result — ProgressResult and the
//     voucher serializer carry no customer name; left blank.
import type {
  CampaignScanRow,
  CampaignVoucherScanResult,
  ConfirmVisitResult,
  RedeemCampaignVoucherResult,
  ScanCustomerResult,
} from "./types";

type Raw = Record<string, any>;

// Backend rule summary for one campaign row's sub-line ("Visit 3× / day").
function ruleSub(campaign: Raw): string {
  const parts: string[] = [];
  const businessName = campaign.business_name;
  if (businessName) parts.push(String(businessName));
  const rule = campaign.rule ?? {};
  const required = rule.required_count ?? null;
  if (campaign.campaign_type === "group") {
    if (rule.required_group_size != null) parts.push(`Group of ${rule.required_group_size}`);
  } else if (required != null) {
    let line = `Visit ${required}×`;
    if (rule.window_before_time) line += ` before ${rule.window_before_time}`;
    parts.push(line);
  }
  return parts.join(" · ");
}

// CustomerScanResultSerializer → ScanCustomerResult (rows + none_eligible).
export function adaptScanCustomerResult(raw: Raw): ScanCustomerResult {
  const campaigns: Raw[] = Array.isArray(raw.campaigns) ? raw.campaigns : [];
  const rows: CampaignScanRow[] = campaigns.map((row) => {
    const campaign = row.campaign ?? {};
    const current = row.progress_count ?? 0;
    const goal = row.required_count ?? 0;
    return {
      campaign_id: campaign.id,
      name: campaign.name ?? "",
      sub: ruleSub(campaign),
      current_count: current,
      next_count: Math.min(current + 1, goal || current + 1),
      goal,
      eligible: !!row.eligible,
      // reason_code is a stable error code (e.g. CAMPAIGN_MIN_GAP); the screen
      // shows it as the sub-line when a row is blocked.
      reason: row.eligible ? null : (row.reason_code ?? null),
    };
  });
  return {
    customer: {
      id: raw.customer?.id ?? "",
      name: raw.customer?.name ?? "",
      // Backend flattens customer to id + name only; phone is not exposed.
      phone: raw.customer?.phone ?? "",
    },
    rows,
    none_eligible: rows.length === 0 || rows.every((r) => !r.eligible),
  };
}

// ProgressResultSerializer → ConfirmVisitResult (counted / completed).
export function adaptConfirmVisitResult(raw: Raw): ConfirmVisitResult {
  const campaign = raw.campaign ?? {};
  const voucher = raw.voucher ?? null;
  return {
    state: raw.completed ? "completed" : "counted",
    // ProgressResult carries no customer name; the screen renders it blank.
    customer_name: raw.customer_name ?? "",
    campaign_name: campaign.name ?? "",
    current_count: raw.progress_count ?? 0,
    goal: raw.required_count ?? 0,
    reward_title: voucher?.reward_title ?? null,
    // Voucher serializer exposes an ISO expires_at, not a human label.
    expires_label: voucher?.expires_at ?? null,
  };
}

// CampaignRewardVoucherSerializer → CampaignVoucherScanResult. A *valid* scan
// resolves to the voucher object (state "valid"); the backend raises a typed
// error for an invalid voucher, which the API method maps to a non-valid state.
export function adaptVoucherScanResult(raw: Raw): CampaignVoucherScanResult {
  return {
    state: "valid",
    voucher_id: raw.id ?? null,
    // The voucher serializer does not expose the owning customer.
    customer_name: null,
    campaign_name: raw.campaign_name ?? null,
    reward_title: raw.reward_title ?? null,
    expires_label: raw.expires_at ?? null,
    code: raw.voucher_code ?? null,
    reason: null,
    // Group check-in resolution is a Phase 2 seam (plan Q4); single vouchers only.
    group: null,
  };
}

// CampaignRewardVoucherSerializer (post-redeem) → RedeemCampaignVoucherResult.
export function adaptRedeemResult(raw: Raw): RedeemCampaignVoucherResult {
  return {
    voucher_id: raw.id ?? "",
    reward_title: raw.reward_title ?? "",
    // The voucher serializer does not expose the owning customer.
    customer_name: "",
  };
}
