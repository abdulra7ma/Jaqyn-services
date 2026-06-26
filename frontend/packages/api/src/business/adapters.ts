// Boundary validation for business campaign payloads (apps.campaigns). Coerces
// raw backend rows into the UI domain types — the codebase's adapter pattern in
// place of zod, matching customer/adapters.ts.
import type {
  BusinessCampaign,
  BusinessCampaignListResponse,
  BusinessCampaignMechanic,
  BusinessCampaignType,
  CampaignAnalytics,
  CampaignDetailGroup,
  CampaignDetailTabs,
  CampaignParticipantRow,
  CampaignPayload,
  CampaignSocialPost,
  CampaignTypeStats,
  CampaignVoucherRow,
  SocialPostCaptions,
} from "./types";

type Raw = Record<string, any>;

// Normalize the backend campaign_type onto the UI discriminator (campaigns-
// restructure design §3): individual/group/social. Legacy visit/time_window rows
// degrade to INDIVIDUAL.
export function fromBackendCampaignType(raw: string | undefined): BusinessCampaignType {
  if (raw === "group") return "group";
  if (raw === "social") return "social";
  return "individual";
}

// Inverse of fromBackendCampaignType for write payloads. The UI type maps 1:1 to
// the backend enum now that both use individual/group/social.
function toBackendCampaignType(type: BusinessCampaignType): string {
  return type;
}

// Normalize the INDIVIDUAL completion mechanic (campaigns-restructure design §3).
function fromBackendMechanic(raw: string | undefined): BusinessCampaignMechanic | null {
  if (raw === "stamp") return "stamp";
  if (raw === "spend") return "spend";
  if (raw === "visit") return "visit";
  return null;
}

// The rule_type the backend stores for a given campaign type/mechanic. Source:
// CampaignRule.RuleType in apps.campaigns.models. INDIVIDUAL maps by mechanic;
// GROUP is group_checkin; SOCIAL has no rule_type constraint (defaults to visit).
function ruleTypeFor(type: BusinessCampaignType, mechanic?: BusinessCampaignMechanic): string {
  if (type === "group") return "group_checkin";
  if (mechanic === "spend") return "spend";
  if (mechanic === "stamp") return "stamp";
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
    // Backend emits completion_limit_per_customer; repeat_policy is the wizard field name.
    repeat_policy: raw.repeat_policy ?? raw.completion_limit_per_customer ?? raw.repeat ?? "once",
    max_participants: raw.max_participants ?? null,
    staff_approval_required: raw.staff_approval_required ?? true,
    instagram_handle: raw.instagram_handle ?? null,
    rule: {
      // Backend keys: mechanic (visit/stamp/spend), required_spend (decimal),
      // minimum_time_between_actions (ISO duration), group_checkin_window_minutes.
      mechanic: fromBackendMechanic(rule.mechanic),
      required_count: rule.required_count ?? rule.visits ?? null,
      required_spend:
        rule.required_spend != null ? String(rule.required_spend) : (rule.requiredSpend ?? null),
      max_count_per_day: rule.max_count_per_day ?? rule.perDay ?? null,
      min_time_between: rule.minimum_time_between_actions ?? rule.min_time_between ?? rule.minGap ?? null,
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

// One stat slot from the backend type_stats payload ({label, value}); defaults
// keep the triplet well-formed when a slot is missing.
function adaptStat(raw: Raw | null | undefined): { label: string; value: number } {
  return { label: raw?.label ?? "", value: Number(raw?.value ?? 0) };
}

// The per-type headline stat triplet (campaigns-restructure design §5). Reads the
// backend list serializer's `type_stats` ({stat_a, stat_b, stat_c}).
export function adaptTypeStats(raw: Raw | null | undefined): CampaignTypeStats {
  const s = raw ?? {};
  return {
    stat_a: adaptStat(s.stat_a),
    stat_b: adaptStat(s.stat_b),
    stat_c: adaptStat(s.stat_c),
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
      type_stats: adaptTypeStats(c.type_stats),
      reward_title: c.reward_title ?? c.reward?.title ?? "",
      ends_label: c.ends_label ?? c.ends ?? c.end_label ?? "",
    })),
  };
}

// One group row in the tabbed detail's Groups tab (GROUP campaigns only).
function adaptDetailGroup(raw: Raw): CampaignDetailGroup {
  return {
    id: raw.id,
    status: raw.status,
    required_size: raw.required_size ?? 0,
    members: (raw.members ?? []).map((m: Raw) => ({
      id: m.id,
      customer: m.customer ?? "",
      status: m.status ?? "",
    })),
  };
}

// The tabbed business campaign-detail payload (campaigns-restructure design §5).
// `groups` is empty for non-GROUP campaigns. Each tab is adapted with the matching
// row adapter so the detail screen reads UI-domain shapes.
export function adaptCampaignDetailTabs(raw: Raw): CampaignDetailTabs {
  const analytics = raw.analytics ?? {};
  return {
    overview: adaptBusinessCampaign(raw.overview ?? {}),
    settings: adaptBusinessCampaign(raw.settings ?? raw.overview ?? {}),
    participants: (raw.participants ?? []).map(adaptParticipant),
    reward_usage: (raw.reward_usage ?? []).map(adaptVoucherRow),
    groups: (raw.groups ?? []).map(adaptDetailGroup),
    analytics: {
      ...adaptAnalytics(analytics),
      type_stats: adaptTypeStats(analytics.type_stats),
    },
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
// The schedule/constraint fields (start_at, end_at, active_days,
// active_start_time, active_end_time, and the rule's minimum_time_between_actions
// / window_before_time / group_checkin_window_minutes) ARE sent: the wizard's
// free-text inputs are parsed into these structured shapes in toPayload
// (business/_components/campaigns.tsx) before reaching this mapper, so a campaign
// keeps its schedule and constraints. Unparseable input is omitted (CampaignPayload
// leaves it undefined) rather than sent as garbage.
export function toCampaignWritePayload(payload: Partial<CampaignPayload>): Raw {
  const type = (payload.type ?? "individual") as BusinessCampaignType;
  const mechanic = payload.mechanic;
  const body: Raw = {};

  if (payload.name !== undefined) body.name = payload.name;
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.type !== undefined) body.campaign_type = toBackendCampaignType(type);
  if (payload.max_participants !== undefined) body.max_participants = payload.max_participants;
  if (payload.max_rewards !== undefined) body.max_rewards = payload.max_rewards;
  if (payload.repeat_policy !== undefined) {
    body.completion_limit_per_customer = payload.repeat_policy;
  }
  // SOCIAL only — the Instagram handle (campaign-level field).
  if (payload.instagram_handle !== undefined) body.instagram_handle = payload.instagram_handle;

  // Campaign-level schedule (CampaignWriteSerializer accepts these directly).
  if (payload.start_at !== undefined) body.start_at = payload.start_at;
  if (payload.end_at !== undefined) body.end_at = payload.end_at;
  if (payload.active_days !== undefined) body.active_days = payload.active_days;
  if (payload.active_start_time !== undefined) body.active_start_time = payload.active_start_time;
  if (payload.active_end_time !== undefined) body.active_end_time = payload.active_end_time;

  // Nested rule — only the fields the chosen type/mechanic uses, keyed as the
  // serializer expects (campaigns-restructure design §3 CampaignRule).
  const rule: Raw = { rule_type: ruleTypeFor(type, mechanic) };
  if (type === "group") {
    if (payload.required_group_size != null) rule.required_group_size = payload.required_group_size;
    if (payload.group_checkin_window_minutes != null)
      rule.group_checkin_window_minutes = payload.group_checkin_window_minutes;
  } else if (type === "individual") {
    if (mechanic != null) rule.mechanic = mechanic;
    if (mechanic === "spend") {
      if (payload.required_spend != null) rule.required_spend = payload.required_spend;
    } else if (payload.required_count != null) {
      rule.required_count = payload.required_count;
    }
    if (payload.max_count_per_day != null) rule.max_count_per_day = payload.max_count_per_day;
    if (payload.minimum_time_between_actions != null)
      rule.minimum_time_between_actions = payload.minimum_time_between_actions;
  }
  // SOCIAL has no extra rule fields (completion = staff verify).
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
