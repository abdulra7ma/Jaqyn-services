// Maps raw backend payloads (backend/docs/data-model.md serializers) into the UI
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
  CampaignCatalogItem,
  CampaignFeed,
  CampaignFeedSections,
  CampaignProgress,
  CampaignVoucher,
  CampaignWallet,
  GroupSession,
  GroupSessionMember,
  ItemSelection,
  MyGroup,
  PatchesSummary,
  PatchNext,
  PatchOut,
  PatchShape,
  RewardProgram,
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

// The public business profile embeds its reward programs as a read-only catalog
// (distinct from the removed customer-progress endpoints). Kept for the public
// /businesses/{id}/ card.
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

// ---- Campaigns ---------------------------------------------------------------
// Boundary validation for campaign payloads. The backend may send `business` as
// a bare UUID (like rewards/offers) — businessRef fills a placeholder the cards
// tolerate. Progress is relative to the authenticated user.

// Normalize the backend campaign_type onto the UI discriminator. The backend now
// emits individual/group/social (campaigns-restructure design §3); the legacy
// visit/time_window values map onto INDIVIDUAL so old rows degrade gracefully.
function normalizeCampaignType(raw: string | undefined): Campaign["campaign_type"] {
  if (raw === "group") return "group";
  if (raw === "social") return "social";
  return "individual";
}

// Normalize the INDIVIDUAL completion mechanic (campaigns-restructure design §3).
// Null for non-individual campaigns (group/social have no mechanic).
function normalizeMechanic(raw: string | undefined): Campaign["rule"]["mechanic"] {
  if (raw === "visit") return "visit";
  return null;
}

// Normalize the item-reward selection mode (multi-form-loyalty). Null when the
// reward is not an item program.
function normalizeItemSelection(raw: string | undefined): ItemSelection | null {
  if (raw === "fixed") return "fixed";
  if (raw === "customer") return "customer";
  return null;
}

// Boundary validation for a catalog item embedded in a reward/voucher payload or
// returned from the catalog endpoint. Null in → null out (no item set).
export function adaptCatalogItem(raw: Raw | null | undefined): CampaignCatalogItem | null {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name ?? "",
    // Backend serializes price as a decimal string; coerce defensively.
    price: raw.price != null ? String(raw.price) : "",
    image: raw.image ?? raw.image_url ?? null,
  };
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

// Coerces a nullable decimal string (as emitted by the backend for lat/lng) to
// a number or null. `Number(null)` and `Number("")` both return 0, which would
// produce a garbage distance instead of omitting it, so we guard explicitly.
function toLatLng(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
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
      category: raw.business_category ?? biz?.category ?? "other",
      logo_url: raw.business_logo_url ?? biz?.logo_url ?? null,
      area: raw.business_area ?? biz?.area ?? "",
      address: raw.business_address ?? biz?.address ?? "",
    },
    // Backend feed serializer emits business_lat / business_lng as nullable
    // decimal strings; coerce to number|null here so consumers never see raw
    // strings or spurious 0 from Number(null).
    business_lat: toLatLng(raw.business_lat ?? biz?.latitude),
    business_lng: toLatLng(raw.business_lng ?? biz?.longitude),
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
    // Backend `active_days` is a JSON array of weekday codes. Coerce to a display
    // string: empty when every day / none is set (the UI then shows "Daily"),
    // otherwise the joined codes. (Field is typed `string` downstream.)
    active_days: Array.isArray(raw.active_days)
      ? raw.active_days.length === 0 || raw.active_days.length >= 7
        ? ""
        : raw.active_days.join(", ")
      : (raw.active_days ?? raw.days ?? ""),
    // Backend emits separate active_start_time / active_end_time fields
    // (HH:MM:SS); derive a combined display string. No single active_hours field.
    active_hours: deriveActiveHours(raw.active_start_time, raw.active_end_time),
    // Raw HH:MM window bounds — the group create screen builds visit slots from these.
    active_start_time: (raw.active_start_time ?? "").slice(0, 5),
    active_end_time: (raw.active_end_time ?? "").slice(0, 5),
    // Backend field is completion_limit_per_customer, not repeat_policy.
    // Fall back through both names so mock objects using the UI name still work.
    repeat_policy:
      raw.repeat_policy ?? raw.completion_limit_per_customer ?? raw.repeat ?? "once",
    max_participants: raw.max_participants ?? null,
    rule: {
      // Backend keys: visit mechanic, required_count, timing constraints, and
      // group_checkin_window_minutes.
      mechanic: normalizeMechanic(rule.mechanic),
      required_count: rule.required_count ?? rule.visits ?? null,
      max_count_per_day: rule.max_count_per_day ?? rule.perDay ?? null,
      min_time_between: rule.minimum_time_between_actions ?? rule.min_time_between ?? rule.minGap ?? null,
      required_group_size: rule.required_group_size ?? rule.groupSize ?? null,
      group_checkin_window:
        rule.group_checkin_window_minutes != null
          ? `${rule.group_checkin_window_minutes} min`
          : (rule.group_checkin_window ?? rule.checkin ?? null),
      group_checkin_window_minutes: rule.group_checkin_window_minutes ?? null,
    },
    reward: {
      // Backend serializes reward_type / reward_receiver_type (not type / receiver).
      type: reward.reward_type ?? reward.type ?? "free_item",
      title: reward.title ?? "",
      description: reward.description ?? reward.desc ?? "",
      expiry_days_after_unlock: reward.expiry_days_after_unlock ?? reward.expiryDays ?? 7,
      max_redemptions: reward.max_redemptions ?? reward.max ?? null,
      receiver: reward.reward_receiver_type ?? reward.receiver ?? undefined,
      // Item-reward selection mode + preset item (multi-form-loyalty CampaignReward).
      item_selection: normalizeItemSelection(reward.item_selection),
      catalog_item: adaptCatalogItem(reward.catalog_item),
    },
    my_progress: adaptCampaignProgress(raw.my_progress),
    instagram_handle: raw.instagram_handle ?? null,
    auto_join_link: raw.auto_join_link ?? null,
  };
}

// Maps the {followed, discover, sections} feed payload into adapted Campaign lists.
// `sections` (featured/trending/fresh) added in campaigns redesign B; tolerates
// absence so old endpoints degrade to empty sections without crashing.
export function adaptCampaignFeed(raw: Raw): CampaignFeed {
  const sections = raw.sections as Raw | null | undefined;
  const adaptedSections: CampaignFeedSections = {
    featured: ((sections?.featured ?? []) as Raw[]).map(adaptCampaign),
    trending: ((sections?.trending ?? []) as Raw[]).map(adaptCampaign),
    fresh: ((sections?.fresh ?? []) as Raw[]).map(adaptCampaign),
  };
  return {
    followed: (raw.followed ?? [] as Raw[]).map(adaptCampaign),
    discover: (raw.discover ?? [] as Raw[]).map(adaptCampaign),
    sections: adaptedSections,
  };
}

// ---- Patches -----------------------------------------------------------------

function normalizePatchShape(raw: unknown): PatchShape {
  if (raw === "shield") return "shield";
  if (raw === "hexagon") return "hexagon";
  if (raw === "banner") return "banner";
  return "circle";
}

export function adaptPatchOut(raw: Raw): PatchOut {
  return {
    slug: String(raw.slug ?? ""),
    name: String(raw.name ?? ""),
    shape: normalizePatchShape(raw.shape),
    icon: String(raw.icon ?? ""),
    color: String(raw.color ?? "#C25E3C"),
    light: String(raw.light ?? "#FBEFD9"),
    deep: String(raw.deep ?? "#A2492A"),
    how: String(raw.how ?? ""),
    earned: Boolean(raw.earned),
    earned_at: raw.earned_at != null ? String(raw.earned_at) : null,
    progress_current: typeof raw.progress_current === "number" ? raw.progress_current : Number(raw.progress_current ?? 0),
    progress_target: typeof raw.progress_target === "number" ? raw.progress_target : Number(raw.progress_target ?? 1),
  };
}

export function adaptPatchesSummary(raw: Raw): PatchesSummary {
  const next = raw.next as Raw | null | undefined;
  const adaptedNext: PatchNext = next
    ? {
        slug: String(next.slug ?? ""),
        name: String(next.name ?? ""),
        shape: normalizePatchShape(next.shape),
        icon: String(next.icon ?? ""),
        color: String(next.color ?? "#C25E3C"),
        light: String(next.light ?? "#FBEFD9"),
        deep: String(next.deep ?? "#A2492A"),
        current: typeof next.current === "number" ? next.current : Number(next.current ?? 0),
        target: typeof next.target === "number" ? next.target : Number(next.target ?? 1),
        remaining_label: String(next.remaining_label ?? ""),
      }
    : null;
  return {
    earned_count: typeof raw.earned_count === "number" ? raw.earned_count : Number(raw.earned_count ?? 0),
    total: typeof raw.total === "number" ? raw.total : Number(raw.total ?? 0),
    board_seen: Boolean(raw.board_seen),
    next: adaptedNext,
    unseen_earned: ((raw.unseen_earned ?? []) as Raw[]).map(adaptPatchOut),
    patches: ((raw.patches ?? []) as Raw[]).map(adaptPatchOut),
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
    // Item vouchers carry the chosen/preset CatalogItem + the selection mode so the
    // present screen can offer "Choose your item" for unresolved customer-choice ones.
    catalog_item: adaptCatalogItem(raw.catalog_item),
    item_selection: ((): ItemSelection | null => {
      if (raw.item_selection === "fixed") return "fixed";
      if (raw.item_selection === "customer") return "customer";
      return null;
    })(),
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
    status: raw.status ?? null,
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
      // Backend emits the campaign FK as a bare id plus a denormalized
      // `campaign_name`. Fall through an embedded object for the typed mocks.
      id: camp?.id ?? raw.campaign ?? "",
      name: raw.campaign_name ?? camp?.name ?? "",
      glyph: raw.glyph ?? camp?.glyph ?? "",
    },
    business_name: raw.business_name ?? "",
    business_logo_url: raw.business_logo_url ?? null,
    group_leader: leaderId,
    // Backend GroupSessionSerializer emits `invite_code` (and a full `invite_url`).
    // Tolerate the legacy `invite_token` name for older mocks.
    invite_code: raw.invite_code ?? raw.invite_token ?? raw.code ?? "",
    invite_url: raw.invite_url ?? "",
    status: raw.status,
    required_size: raw.required_size ?? raw.size ?? members.length,
    joined_count: raw.joined_count ?? members.length,
    members,
    visit_time: raw.visit_time ?? null,
    name: raw.name ?? null,
    note: raw.note ?? null,
    // The group check-in QR token is only present once the group is full
    // (type GROUP_CHECKIN); else null so the full-state QR simply doesn't render.
    checkin_token: raw.checkin_token ?? raw.token ?? null,
  };
}

// Maps a my-groups list row. Tolerates an embedded campaign object (mocks) or the
// flat `campaign` id + `campaign_name` the backend list emits.
export function adaptMyGroup(raw: Raw): MyGroup {
  const camp = typeof raw.campaign === "object" ? raw.campaign : null;
  return {
    id: raw.id,
    campaign_id: raw.campaign_id ?? camp?.id ?? raw.campaign ?? "",
    campaign_name: raw.campaign_name ?? camp?.name ?? "",
    business_name: raw.business_name ?? "",
    business_logo_url: raw.business_logo_url ?? null,
    status: raw.status,
    required_size: raw.required_size ?? raw.size ?? 0,
    joined_count: raw.joined_count ?? 0,
  };
}
