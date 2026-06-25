// Maps raw backend payloads (tasks/_shared/SCHEMAS.md serializers) into the UI
// domain types the screens consume. Isolates two backend realities the UI must
// not care about:
//   • `business` arrives as a bare UUID in rewards/offers/groups (no name) —
//     we fill a placeholder Business; cards tolerate an empty name.
//   • group membership flags are relative to the authenticated user — we compute
//     is_member / is_leader / checked_in from the stored user id.
import { session } from "./session";
import type {
  Business,
  Campaign,
  CampaignProgress,
  CampaignVoucher,
  CampaignWallet,
  GroupDeal,
  GroupMember,
  GroupOffer,
  GroupSession,
  GroupSessionMember,
  RewardProgram,
  RewardProgress,
} from "./types";

type Raw = Record<string, any>;

// A business reference that is only a UUID in the payload.
function businessRef(id: string, name = "", area = ""): Business {
  return {
    id,
    name,
    category: "other",
    description: null,
    address: "",
    area,
    latitude: null,
    longitude: null,
    phone: "",
    public_email: null,
    website_url: null,
    instagram_url: null,
    logo_url: null,
    cover_url: null,
    glyph: "",
    accent_color: "#C25E3C",
    price_level: "",
    tags: [],
    working_hours: null,
  };
}

export function adaptBusiness(raw: Raw): Business {
  return {
    id: raw.id,
    name: raw.name ?? "",
    category: raw.category ?? "other",
    description: raw.description ?? null,
    address: raw.address ?? "",
    area: raw.area ?? "",
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    phone: raw.phone ?? "",
    public_email: raw.public_email ?? null,
    website_url: raw.website_url ?? null,
    instagram_url: raw.instagram_url ?? null,
    logo_url: raw.logo_url ?? null,
    cover_url: raw.cover_url ?? null,
    glyph: raw.glyph ?? "",
    accent_color: raw.accent_color ?? "#C25E3C",
    price_level: raw.price_level ?? "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    working_hours: raw.working_hours ?? null,
    distance_km: raw.distance_km ?? null,
    reward: raw.reward ?? null,
    rewards: (raw.rewards ?? []).map(adaptProgram),
    group_offers: raw.group_offers ?? [],
    catalog_sections: raw.catalog_sections ?? [],
    gallery: raw.gallery ?? [],
  };
}

export function adaptProgram(raw: Raw): RewardProgram {
  return {
    id: raw.id,
    type: raw.type,
    title: raw.title,
    description: raw.description ?? "",
    required_count: raw.required_count ?? null,
    reward_description: raw.reward_description ?? "",
    terms: raw.terms ?? null,
  };
}

export function adaptProgress(raw: Raw): RewardProgress {
  const program = adaptProgram(raw.reward_program ?? {});
  return {
    id: raw.id,
    business: {
      id: typeof raw.business === "string" ? raw.business : raw.business?.id,
      name: raw.business_name ?? (typeof raw.business === "object" ? raw.business?.name : "") ?? "",
      category: "other",
      logo_url: null,
      area: raw.business_area ?? "",
    },
    reward_program: program,
    current_count: raw.current_count ?? 0,
    target_count: raw.target_count ?? program.required_count ?? null,
    status: raw.status,
    unlocked_at: raw.unlocked_at ?? null,
    expires_at: raw.expires_at ?? null,
  };
}

export function adaptOffer(raw: Raw): GroupOffer {
  const biz = typeof raw.business === "object" ? raw.business : null;
  return {
    id: raw.id,
    business: {
      id: biz?.id ?? raw.business,
      name: raw.business_name ?? biz?.name ?? "",
      category: "other",
      area: raw.business_area ?? biz?.area ?? "",
      logo_url: null,
    },
    title: raw.title,
    description: raw.description ?? "",
    reward_type: raw.reward_type,
    reward_description: raw.reward_description ?? "",
    min_group_size: raw.min_group_size,
    max_group_size: raw.max_group_size ?? null,
    valid_from: raw.valid_from,
    valid_to: raw.valid_to,
    time_start: (raw.time_start ?? "").slice(0, 5),
    time_end: (raw.time_end ?? "").slice(0, 5),
    checkin_window_minutes: raw.checkin_window_minutes ?? 30,
    requires_staff_code: raw.requires_staff_code ?? true,
    terms: raw.terms ?? null,
    status: raw.status,
  };
}

function adaptMember(raw: Raw, leaderId: string | null): GroupMember {
  const customerId: string = raw.customer ?? raw.id;
  return {
    id: raw.id,
    name: raw.customer_name || raw.name || `#${String(customerId).slice(0, 6)}`,
    status: raw.status,
    is_leader: leaderId != null && customerId === leaderId,
  };
}

export function adaptDeal(raw: Raw): GroupDeal {
  const uid = session.getUserId();
  const leaderId: string | null = raw.leader ?? null;
  const members = (raw.members ?? []).map((m: Raw) => adaptMember(m, leaderId));
  const selfRaw = (raw.members ?? []).find((m: Raw) => (m.customer ?? m.id) === uid);
  return {
    id: raw.id,
    invite_token: raw.invite_token,
    group_offer: adaptOffer(raw.group_offer ?? {}),
    visit_time: raw.visit_time,
    status: raw.status,
    reward_code: raw.reward_code ?? null,
    members,
    is_member: !!selfRaw,
    is_leader: uid != null && leaderId === uid,
    checked_in: selfRaw?.status === "checked_in",
  };
}

// ---- Campaigns ---------------------------------------------------------------
// Boundary validation for campaign payloads. The backend may send `business` as
// a bare UUID (like rewards/offers) — businessRef fills a placeholder the cards
// tolerate. Progress is relative to the authenticated user.

// The backend campaign_type enum is "time_window" (underscored); the UI type is
// "timewindow". Normalize so the screens' type checks match.
function normalizeCampaignType(raw: string | undefined): Campaign["campaign_type"] {
  if (raw === "time_window" || raw === "timewindow") return "timewindow";
  if (raw === "group") return "group";
  return "visit";
}

function adaptCampaignProgress(raw: Raw | null | undefined): CampaignProgress | null {
  if (!raw) return null;
  const status = raw.status ?? (raw.completed ? "completed" : raw.joined ? "in_progress" : null);
  const completed = raw.completed ?? (status === "completed" || status === "redeemed");
  return {
    joined: raw.joined ?? status != null,
    status: status ?? null,
    // LOCKED FE/BE CONTRACT: the backend CampaignProgressSerializer emits
    // `progress_count` / `required_count` / `voucher_id` (see plan §3 + the
    // serializer in apps.campaigns). Map them onto the UI's
    // current_count / target_count / voucher_id. The legacy `current_count` /
    // `target_count` / `progress` / `goal` keys are kept only as a tolerant
    // fallback so the typed mock objects (which already use UI names) still pass
    // through unchanged.
    current_count: raw.progress_count ?? raw.current_count ?? raw.progress ?? 0,
    target_count: raw.required_count ?? raw.target_count ?? raw.goal ?? null,
    completed,
    voucher_id: raw.voucher_id ?? null,
  };
}

// Formats an ISO date string (YYYY-MM-DDTHH:MM:SS…) to a short date label
// (YYYY-MM-DD). Used when the backend emits raw ISO values rather than
// pre-formatted display labels.
function formatDateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

// Computes "days remaining" from an ISO end_at timestamp. Returns 0 when the
// campaign has already ended or end_at is absent, matching the endsLabel
// "Ends today" threshold in _components/campaigns.tsx:57.
function computeDaysLeft(endAt: string | null | undefined): number {
  if (!endAt) return 0;
  const ms = Date.parse(endAt) - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

// Derives a human-readable "HH:MM – HH:MM" string from separate start/end time
// fields (HH:MM:SS or HH:MM). Returns an empty string when neither field is set.
function deriveActiveHours(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  const s = (startTime ?? "").slice(0, 5);
  const e = (endTime ?? "").slice(0, 5);
  if (!s && !e) return "";
  if (!e) return s;
  if (!s) return e;
  return `${s} – ${e}`;
}

export function adaptCampaign(raw: Raw): Campaign {
  const biz = typeof raw.business === "object" ? raw.business : null;
  const rule = raw.rule ?? {};
  const reward = raw.reward ?? {};
  return {
    id: raw.id,
    business: {
      id: biz?.id ?? raw.business,
      name: raw.business_name ?? biz?.name ?? "",
      category: biz?.category ?? "other",
      logo_url: raw.business_logo_url ?? biz?.logo_url ?? null,
      area: raw.business_area ?? biz?.area ?? "",
    },
    // No backend `glyph` field — fall through to empty string so GlyphTile
    // degrades to the logo/initial fallback without reading undefined.
    glyph: "",
    name: raw.name,
    description: raw.description ?? "",
    blurb: raw.blurb ?? raw.description ?? "",
    campaign_type: normalizeCampaignType(raw.campaign_type ?? raw.type),
    status: raw.status,
    // Backend emits start_at/end_at (ISO); compute display labels client-side.
    // The legacy *_label fields do not exist on the serializer.
    start_label: formatDateLabel(raw.start_at) ?? raw.start ?? "",
    end_label: formatDateLabel(raw.end_at) ?? raw.end ?? "",
    // Derive from end_at; the backend does not emit a days_left field.
    days_left: computeDaysLeft(raw.end_at),
    active_days: raw.active_days ?? raw.days ?? "",
    // Backend emits separate active_start_time / active_end_time fields
    // (HH:MM:SS); derive a combined display string. No single active_hours field.
    active_hours: deriveActiveHours(raw.active_start_time, raw.active_end_time),
    // Backend field is completion_limit_per_customer, not repeat_policy.
    // Fall back through both names so mock objects using the UI name still work.
    repeat_policy:
      raw.repeat_policy ?? raw.completion_limit_per_customer ?? raw.repeat ?? "once",
    max_participants: raw.max_participants ?? null,
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
    my_progress: adaptCampaignProgress(raw.my_progress),
    auto_join_link: raw.auto_join_link ?? null,
  };
}

// The voucher serializer returns ISO timestamps (issued_at / expires_at /
// redeemed_at), not the pre-formatted labels the design mocks assumed. Reduce an
// ISO value to its date portion for display; null/empty stays empty. NOTE: this
// is a stopgap — locale-aware formatting belongs in the component via @jaqyn/i18n.
function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

// "Expiring soon" = within EXPIRING_SOON_DAYS of expiry. Source: design's amber
// pill threshold (voucher window is ~7 days after unlock per plan §1.1).
const EXPIRING_SOON_DAYS = 3;

function isExpiringSoon(expiresIso: string | null | undefined): boolean {
  if (!expiresIso) return false;
  const expires = Date.parse(expiresIso);
  if (Number.isNaN(expires)) return false;
  const msLeft = expires - Date.now();
  return msLeft > 0 && msLeft <= EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
}

export function adaptCampaignVoucher(raw: Raw): CampaignVoucher {
  const biz = typeof raw.business === "object" ? raw.business : null;
  const camp = typeof raw.campaign === "object" ? raw.campaign : null;
  return {
    id: raw.id,
    code: raw.code ?? raw.voucher_code,
    status: raw.status,
    // No backend `glyph` field — fall through to empty string so GlyphTile
    // degrades to the logo/initial fallback without reading undefined.
    glyph: "",
    business: {
      id: biz?.id ?? raw.business ?? "",
      name: raw.business_name ?? biz?.name ?? raw.bizName ?? "",
    },
    campaign: {
      id: camp?.id ?? raw.campaign ?? "",
      name: raw.campaign_name ?? camp?.name ?? "",
    },
    reward_title: raw.reward_title ?? raw.reward ?? "",
    reward_description: raw.reward_description ?? "",
    // The serializer exposes both the raw qr_token string and a full qr_url; the
    // staff scanner accepts either (parseScanned strips a /q/<token> URL), so the
    // raw token is the smallest stable payload to render.
    qr_token: raw.qr_token ?? raw.token ?? raw.code ?? "",
    issued_label: raw.issued_label ?? dateLabel(raw.issued_at) ?? raw.issued ?? "",
    expires_label: raw.expires_label ?? dateLabel(raw.expires_at) ?? raw.expires ?? "",
    expiring_soon: raw.expiring_soon ?? raw.soon ?? isExpiringSoon(raw.expires_at),
    redeemed_at_label: raw.redeemed_at_label ?? dateLabel(raw.redeemed_at) ?? raw.redeemedAt ?? null,
    // The serializer does not expose the redeeming staff member or a branch
    // (branch scope is deferred — plan D5); both stay null.
    redeemed_by: raw.redeemed_by ?? raw.redeemedBy ?? null,
    redeemed_branch: raw.redeemed_branch ?? raw.branch ?? null,
  };
}

// Groups a flat voucher list into the wallet's three lifecycle sections.
export function adaptCampaignWallet(rows: Raw[]): CampaignWallet {
  const vouchers = rows.map(adaptCampaignVoucher);
  return {
    active: vouchers.filter((v) => v.status === "active"),
    used: vouchers.filter((v) => v.status === "redeemed" || v.status === "cancelled"),
    expired: vouchers.filter((v) => v.status === "expired"),
  };
}

function adaptGroupSessionMember(raw: Raw, leaderId: string | null, uid: string | null): GroupSessionMember {
  const customerId: string = raw.customer ?? raw.id;
  const name: string = raw.customer_name || raw.name || `#${String(customerId).slice(0, 6)}`;
  return {
    id: raw.id,
    name,
    initial: raw.initial ?? name.charAt(0).toUpperCase(),
    is_leader: raw.is_leader ?? (leaderId != null && customerId === leaderId),
    is_you: raw.is_you ?? (uid != null && customerId === uid),
    checked_in: raw.checked_in ?? raw.status === "checked_in",
  };
}

export function adaptGroupSession(raw: Raw): GroupSession {
  const uid = session.getUserId();
  const leaderId: string | null = raw.group_leader ?? raw.leader ?? null;
  // The backend members payload is one row per active member; only joined /
  // checked-in members count toward the group size (left/no-show rows, if any,
  // are excluded from the joined tally).
  const members = (raw.members ?? []).map((m: Raw) => adaptGroupSessionMember(m, leaderId, uid));
  const camp = typeof raw.campaign === "object" ? raw.campaign : null;
  return {
    id: raw.id,
    campaign: {
      id: camp?.id ?? raw.campaign ?? "",
      name: raw.campaign_name ?? camp?.name ?? "",
      glyph: raw.glyph ?? camp?.glyph ?? "",
    },
    // Backend GroupSessionSerializer emits `invite_token`; the UI surfaces it as
    // `invite_code` (the short code rendered into the jaqyn.kg/g/<code> link).
    invite_code: raw.invite_token ?? raw.invite_code ?? raw.code ?? "",
    status: raw.status,
    required_size: raw.required_size ?? raw.size ?? members.length,
    joined_count: raw.joined_count ?? members.length,
    members,
    // The group check-in QR token is not part of the session serializer yet
    // (it's minted when the group fills); tolerate either `checkin_token` or a
    // bare `token`, else null so the full-state QR simply doesn't render.
    checkin_token: raw.checkin_token ?? raw.token ?? null,
  };
}
