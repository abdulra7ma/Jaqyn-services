// Boundary validation for business campaign payloads (apps.campaigns). Coerces
// raw backend rows into the UI domain types — the codebase's adapter pattern in
// place of zod, matching customer/adapters.ts.
import type {
  BusinessCampaign,
  BusinessCampaignListResponse,
  BusinessCampaignType,
  CampaignAnalytics,
  CampaignParticipantRow,
  CampaignPayload,
  CampaignSocialPost,
  CampaignVoucherRow,
  SocialPostCaptions,
} from "./types";

type Raw = Record<string, any>;

// The backend campaign_type enum is "time_window" (underscored); the UI type is
// "timewindow". Normalize on read so the screens' type checks match.
export function fromBackendCampaignType(raw: string | undefined): BusinessCampaignType {
  if (raw === "time_window" || raw === "timewindow") return "timewindow";
  if (raw === "group") return "group";
  return "visit";
}

// Inverse of fromBackendCampaignType for write payloads.
function toBackendCampaignType(type: BusinessCampaignType): string {
  return type === "timewindow" ? "time_window" : type;
}

// The rule_type the backend stores for a given campaign type. Source: CampaignRule
// .RuleType (visit_count / time_window / group_checkin) in apps.campaigns.models.
function ruleTypeFor(type: BusinessCampaignType): string {
  if (type === "group") return "group_checkin";
  if (type === "timewindow") return "time_window";
  return "visit_count";
}

function adaptAnalytics(raw: Raw | null | undefined): CampaignAnalytics {
  const a = raw ?? {};
  return {
    views: a.views ?? 0,
    joined: a.joined ?? 0,
    active: a.active ?? 0,
    completed: a.completed ?? 0,
    issued: a.issued ?? 0,
    redeemed: a.redeemed ?? 0,
    redemption_rate: a.redemption_rate ?? 0,
    estimated_cost: String(a.estimated_cost ?? a.est_cost ?? "0"),
    cost_each: String(a.cost_each ?? a.costEach ?? "0"),
  };
}

export function adaptBusinessCampaign(raw: Raw): BusinessCampaign {
  const rule = raw.rule ?? {};
  const reward = raw.reward ?? {};
  return {
    id: raw.id,
    glyph: raw.glyph ?? "",
    name: raw.name,
    description: raw.description ?? "",
    type: fromBackendCampaignType(raw.campaign_type ?? raw.type),
    status: raw.status,
    start_label: raw.start_label ?? raw.start ?? "",
    end_label: raw.end_label ?? raw.end ?? "",
    active_days: raw.active_days ?? raw.days ?? "",
    active_hours: raw.active_hours ?? raw.hours ?? "",
    repeat_policy: raw.repeat_policy ?? raw.repeat ?? "once",
    max_participants: raw.max_participants ?? null,
    staff_approval_required: raw.staff_approval_required ?? true,
    rule: {
      // Backend keys: minimum_time_between_actions (ISO duration string),
      // group_checkin_window_minutes (int), window_before_time (HH:MM:SS).
      required_count: rule.required_count ?? rule.visits ?? null,
      max_count_per_day: rule.max_count_per_day ?? rule.perDay ?? null,
      min_time_between: rule.minimum_time_between_actions ?? rule.min_time_between ?? rule.minGap ?? null,
      window_before_time:
        (rule.window_before_time ?? rule.windowBefore ?? null)?.slice?.(0, 5) ??
        rule.window_before_time ??
        null,
      required_group_size: rule.required_group_size ?? rule.groupSize ?? null,
      group_checkin_window:
        rule.group_checkin_window_minutes != null
          ? `${rule.group_checkin_window_minutes} min`
          : (rule.group_checkin_window ?? rule.checkin ?? null),
    },
    reward: {
      // Backend serializes reward_type / reward_receiver_type (not type / receiver).
      type: reward.reward_type ?? reward.type ?? "free_item",
      title: reward.title ?? "",
      description: reward.description ?? reward.desc ?? "",
      expiry_days_after_unlock: reward.expiry_days_after_unlock ?? reward.expiryDays ?? 7,
      max_redemptions: reward.max_redemptions ?? reward.max ?? null,
      receiver: reward.reward_receiver_type ?? reward.receiver ?? undefined,
    },
    analytics: adaptAnalytics(raw.analytics),
  };
}

export function adaptCampaignList(raw: Raw): BusinessCampaignListResponse {
  return {
    summary: {
      active_campaigns: raw.summary?.active_campaigns ?? 0,
      total_participants: raw.summary?.total_participants ?? 0,
      rewards_issued: raw.summary?.rewards_issued ?? 0,
      rewards_redeemed: raw.summary?.rewards_redeemed ?? 0,
    },
    campaigns: (raw.results ?? raw.campaigns ?? []).map((c: Raw) => ({
      id: c.id,
      glyph: c.glyph ?? "",
      name: c.name,
      type: fromBackendCampaignType(c.campaign_type ?? c.type),
      status: c.status,
      participants: c.participants ?? c.joined ?? 0,
      completed: c.completed ?? 0,
      redeemed: c.redeemed ?? 0,
      ends_label: c.ends_label ?? c.ends ?? c.end_label ?? "",
    })),
  };
}

export function adaptParticipant(raw: Raw): CampaignParticipantRow {
  return {
    id: raw.id,
    name: raw.name ?? raw.customer_name ?? "",
    progress: raw.progress ?? raw.current_count ?? 0,
    goal: raw.goal ?? raw.target_count ?? null,
    status: raw.status,
    last_visit_label: raw.last_visit_label ?? raw.last ?? "—",
    reward_label: raw.reward_label ?? raw.reward ?? "—",
  };
}

export function adaptVoucherRow(raw: Raw): CampaignVoucherRow {
  return {
    id: raw.id ?? raw.code,
    code: raw.code ?? raw.voucher_code,
    customer: raw.customer ?? raw.customer_name ?? "",
    status: raw.status,
    issued_label: raw.issued_label ?? raw.issued ?? "",
    expires_label: raw.expires_label ?? raw.expires ?? "",
    redeemed_by: raw.redeemed_by ?? raw.redeemedBy ?? "—",
  };
}

// Maps the flat wizard payload (CampaignPayload) onto the backend
// CampaignWriteSerializer shape: a top-level campaign plus nested `rule` and
// `reward` objects, with the campaign_type / rule_type / completion_limit field
// names the serializer expects.
//
// KNOWN GAP — the wizard authors several fields as free text that the strict
// backend types cannot accept as-is, so they are intentionally omitted here
// (sending them would 400 the request):
//   • start_at / end_at  — free text, backend wants ISO datetimes.
//   • active_days        — free text ("Mon–Fri"), backend wants a JSON int list.
//   • active_hours       — free text, backend wants active_start/end_time.
//   • min_time_between   — free text ("4 hours"), backend wants an ISO duration.
//   • group_checkin_window — free text ("15 min"), backend wants minutes (int).
// A human must decide whether to make these wizard inputs structured (date/time
// pickers, weekday multiselect) or to parse them; see the integration manifest.
export function toCampaignWritePayload(payload: Partial<CampaignPayload>): Raw {
  const type = (payload.type ?? "visit") as BusinessCampaignType;
  const body: Raw = {};

  if (payload.name !== undefined) body.name = payload.name;
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.type !== undefined) body.campaign_type = toBackendCampaignType(type);
  if (payload.max_participants !== undefined) body.max_participants = payload.max_participants;
  if (payload.max_rewards !== undefined) body.max_rewards = payload.max_rewards;
  if (payload.repeat_policy !== undefined) {
    body.completion_limit_per_customer = payload.repeat_policy;
  }

  // Nested rule — only the fields the chosen type uses, keyed as the serializer expects.
  const rule: Raw = { rule_type: ruleTypeFor(type) };
  if (type === "group") {
    if (payload.required_group_size != null) rule.required_group_size = payload.required_group_size;
  } else {
    if (payload.required_count != null) rule.required_count = payload.required_count;
    if (payload.max_count_per_day != null) rule.max_count_per_day = payload.max_count_per_day;
  }
  body.rule = rule;

  // Nested reward.
  const reward: Raw = {};
  if (payload.reward_type !== undefined) reward.reward_type = payload.reward_type;
  if (payload.reward_title !== undefined) reward.title = payload.reward_title;
  if (payload.reward_description !== undefined) reward.description = payload.reward_description;
  if (payload.expiry_days_after_unlock !== undefined) {
    reward.expiry_days_after_unlock = payload.expiry_days_after_unlock;
  }
  if (payload.max_rewards != null) reward.max_redemptions = payload.max_rewards;
  if (Object.keys(reward).length > 0) body.reward = reward;

  return body;
}

// ---- Social Post Studio ----------------------------------------------------

const SOCIAL_PLATFORMS = ["instagram", "tiktok", "facebook", "whatsapp"] as const;

// Coerce the raw /social-post/ payload into CampaignSocialPost. Missing string
// fields default to "" and missing captions to "" so the studio always has a
// defined value to render and edit (boundary validation, adapter pattern).
export function adaptSocialPost(raw: Raw): CampaignSocialPost {
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const rawCaptions = (raw.captions ?? {}) as Raw;
  const captions = SOCIAL_PLATFORMS.reduce(
    (acc, p) => {
      acc[p] = str(rawCaptions[p]);
      return acc;
    },
    {} as SocialPostCaptions,
  );
  const hashtags = Array.isArray(raw.hashtags)
    ? raw.hashtags.filter((h: unknown): h is string => typeof h === "string")
    : [];
  return {
    headline: str(raw.headline),
    reward_title: str(raw.reward_title),
    subtext: str(raw.subtext),
    button_text: str(raw.button_text),
    auto_join_url: str(raw.auto_join_url),
    image_url: typeof raw.image_url === "string" ? raw.image_url : null,
    captions,
    hashtags,
  };
}
