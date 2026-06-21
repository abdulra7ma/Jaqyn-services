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
  GroupDeal,
  GroupMember,
  GroupOffer,
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
