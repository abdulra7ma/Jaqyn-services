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
  ActiveVoucher,
  CampaignScanRow,
  CampaignVoucherScanResult,
  ConfirmVisitResult,
  GroupScanResult,
  RedeemCampaignVoucherResult,
  ScanCustomerResult,
  ScanDispatchResult,
  UnifiedScanResult,
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
    parts.push(`Visit ${required}×`);
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
    // mechanic comes from the row (multi-form contract); fall back to the
    // campaign's nested rule for older payloads that nested it there.
    const mechanic = (row.mechanic ?? campaign.rule?.mechanic ?? null) as CampaignScanRow["mechanic"];
    // A social campaign has no mechanic but its own action; tag it so the chooser
    // can render a "Confirm post" row.
    const campaignType = String(row.campaign_type ?? campaign.campaign_type ?? "individual");
    const effectiveMechanic = mechanic ?? (campaignType === "social" ? "social" : null);
    return {
      campaign_id: campaign.id,
      name: campaign.name ?? "",
      sub: ruleSub(campaign),
      business_name: String(campaign.business?.name ?? campaign.business_name ?? ""),
      current_count: current,
      next_count: Math.min(current + 1, goal || current + 1),
      goal,
      eligible: !!row.eligible,
      // reason_code is a stable error code (e.g. CAMPAIGN_MIN_GAP); the screen
      // shows it as the sub-line when a row is blocked.
      reason: row.eligible ? null : (row.reason_code ?? null),
      mechanic: effectiveMechanic,
      campaign_type: campaignType,
      reward_title: row.reward_title ?? null,
      points_balance: row.points_balance ?? 0,
      // Decimal strings are kept verbatim — parsed at the point of arithmetic so
      // no float precision is introduced at the boundary.
      points_per_som: row.points_per_som ?? null,
      points_per_visit: row.points_per_visit ?? null,
      cashback_per_point: row.cashback_per_point ?? null,
      current_spend: String(row.current_spend ?? "0"),
    };
  });
  const activeVouchers: ActiveVoucher[] = Array.isArray(raw.active_vouchers)
    ? raw.active_vouchers.map((v: Raw) => ({
        id: String(v.id ?? ""),
        source: v.source === "loyalty" ? "loyalty" : "campaign",
        label: String(v.label ?? ""),
        expires_label: String(v.expires_label ?? ""),
      }))
    : [];
  return {
    customer: {
      id: raw.customer?.id ?? "",
      name: raw.customer?.name ?? "",
      // Backend flattens customer to id + name only; phone is not exposed.
      phone: raw.customer?.phone ?? "",
    },
    rows,
    none_eligible: rows.length === 0 || rows.every((r) => !r.eligible),
    active_vouchers: activeVouchers,
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
    // New points balance after a points award (0 for non-points programs).
    points_balance: raw.points_balance ?? 0,
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

// Unified visit endpoint → UnifiedScanResult. The loyalty leg is the staff
// collect result verbatim; each campaign leg reuses adaptConfirmVisitResult.
// campaigns may be empty; skipped_campaigns carries blocked candidates.
export function adaptUnifiedScan(raw: Raw): UnifiedScanResult {
  const campaigns: Raw[] = Array.isArray(raw.campaigns) ? raw.campaigns : [];
  const skipped: Raw[] = Array.isArray(raw.skipped_campaigns) ? raw.skipped_campaigns : [];
  return {
    customer: {
      name: raw.customer?.name ?? "",
      phone: raw.customer?.phone ?? "",
    },
    campaigns: campaigns.map(adaptConfirmVisitResult),
    skipped_campaigns: skipped.map((s) => ({
      campaign_id: s.campaign_id ?? "",
      name: s.name ?? "",
      reason_code: s.reason_code ?? "",
    })),
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

// Scan dispatch endpoint → ScanDispatchResult. Reuses the customer-scan and
// voucher-scan adapters per kind so the screen branches on a single tag.
export function adaptScanDispatch(raw: Raw): ScanDispatchResult {
  if (raw.kind === "customer") {
    // Legacy path: raw payload uses separate loyalty/campaigns arrays instead of
    // the unified customer object. Adapt into ScanCustomerResult shape inline.
    if (Array.isArray(raw.loyalty) || Array.isArray(raw.campaigns)) {
      const loyalty: Raw[] = Array.isArray(raw.loyalty) ? raw.loyalty : [];
      // GROUP-type campaigns are excluded from the chooser (B2 spec).
      const campaigns: Raw[] = (Array.isArray(raw.campaigns) ? raw.campaigns : [])
        .filter((r: Raw) => r.campaign_type !== "group");
      const loyaltyRows: CampaignScanRow[] = loyalty.map((row) => ({
        campaign_id: `loyalty:${row.program_id ?? ""}`,
        name: row.name ?? "",
        sub: row.reward_title ?? "",
        business_name: "",
        current_count:
          row.type === "stamp"
            ? Number(row.stamps_count ?? 0)
            : row.type === "visit"
              ? Number(row.visits_count ?? 0)
              : Number(row.points_balance ?? 0),
        next_count: 0,
        goal: Number(row.required_count ?? 0),
        eligible: true,
        reason: null,
        mechanic: row.type ?? null,
        campaign_type: "loyalty",
        reward_title: row.reward_title ?? null,
        points_balance: Number(row.points_balance ?? 0),
        points_per_som: row.points_per_som ?? null,
        points_per_visit: row.points_per_visit ?? null,
        cashback_per_point: row.cashback_per_point ?? null,
        current_spend: String(row.current_spend ?? "0"),
      }));
      const campaignRows: CampaignScanRow[] = campaigns.map((row) => ({
        campaign_id: row.campaign_id ?? "",
        name: row.name ?? "",
        sub: "",
        business_name: "",
        current_count: Number(row.progress_count ?? 0),
        next_count: Number(row.progress_count ?? 0) + 1,
        goal: Number(row.required_count ?? 0),
        eligible: Boolean(row.eligible),
        reason: row.reason_code ?? null,
        mechanic: (row.mechanic ?? "visit") as CampaignScanRow["mechanic"],
        campaign_type: "individual",
        reward_title: row.reward_title ?? null,
        points_balance: 0,
        points_per_som: null,
        points_per_visit: null,
        cashback_per_point: null,
        current_spend: "0",
      }));
      const allRows = [...loyaltyRows, ...campaignRows];
      const activeVouchers: ActiveVoucher[] = Array.isArray(raw.active_vouchers)
        ? raw.active_vouchers.map((v: Raw) => ({
            id: String(v.id ?? ""),
            source: v.source === "loyalty" ? ("loyalty" as const) : ("campaign" as const),
            label: String(v.label ?? ""),
            expires_label: String(v.expires_label ?? ""),
          }))
        : [];
      return {
        kind: "customer",
        customer: {
          customer: {
            id: "",
            name: raw.customer?.name ?? "",
            phone: raw.customer?.phone_masked ?? "",
          },
          rows: allRows,
          none_eligible: !allRows.some((row) => row.eligible),
          active_vouchers: activeVouchers,
        },
        voucher: null,
        group: null,
        reason: null,
      };
    }
    return {
      kind: "customer",
      customer: adaptScanCustomerResult(raw),
      voucher: null,
      group: null,
      reason: null,
    };
  }
  if (raw.kind === "voucher") {
    const voucher = adaptVoucherScanResult(raw.voucher ?? {});
    if (raw.domain === "loyalty" && voucher.code) voucher.code = `loyalty:${voucher.code}`;
    return {
      kind: "voucher",
      customer: null,
      voucher,
      group: null,
      reason: null,
    };
  }
  if (raw.kind === "group") {
    const g = raw.group ?? raw; // backend may inline fields or nest under "group"
    const members = Array.isArray(g.members)
      ? g.members.map((m: Raw) => ({
          name: String(m.name ?? ""),
          status: String(m.status ?? "joined"),
          is_leader: Boolean(m.is_leader),
        }))
      : [];
    const groupResult: GroupScanResult = {
      group_session_id: String(g.group_session_id ?? raw.group_session_id ?? ""),
      campaign_name: String(g.campaign_name ?? raw.campaign_name ?? ""),
      required_size: Number(g.required_size ?? raw.required_size ?? 0),
      status: String(g.status ?? raw.status ?? ""),
      leader_name: String(g.leader_name ?? raw.leader_name ?? ""),
      members,
    };
    return { kind: "group", customer: null, voucher: null, group: groupResult, reason: null };
  }
  return { kind: "invalid", customer: null, voucher: null, group: null, reason: raw.reason_code ?? raw.reason ?? null };
}
