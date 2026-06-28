"use client";

import type {
  BusinessCampaignMechanic,
  BusinessCampaignStatus,
  BusinessCampaignType,
  CampaignPayload,
  CampaignVoucherStatus,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge } from "@jaqyn/ui";

// Shared business-campaign vocabulary for the OwnerShell screens (list / create /
// detail). Primitives compose from @jaqyn/ui; copy goes through @jaqyn/i18n. Tokens
// from the Tailwind preset — no new hex. Campaigns-restructure design §5/§6/§6a:
// type discriminator is individual/group/social with an Individual mechanic.

/** Campaign status → Badge tone (design status pills). */
export const STATUS_TONE: Record<
  BusinessCampaignStatus,
  "brand" | "ok" | "neutral" | "warn" | "danger"
> = {
  draft: "neutral",
  scheduled: "warn",
  active: "ok",
  paused: "warn",
  ended: "neutral",
  cancelled: "danger",
};

/** Voucher status → Badge tone (design voucher pills). */
export const VOUCHER_TONE: Record<CampaignVoucherStatus, "ok" | "neutral" | "danger"> = {
  active: "ok",
  redeemed: "neutral",
  expired: "danger",
  cancelled: "neutral",
};

/** Glyph emoji for a campaign type, used when a campaign has no image (design). */
export const TYPE_GLYPH: Record<BusinessCampaignType, string> = {
  individual: "🔁",
  group: "👥",
  social: "✦",
};

/** The three campaign types, in the order the chooser renders them. */
export const CAMPAIGN_TYPES: BusinessCampaignType[] = ["individual", "group", "social"];

/** Status pill matching the desktop table cells. */
export function StatusPill({ status }: { status: BusinessCampaignStatus }) {
  const t = useT();
  return <Badge tone={STATUS_TONE[status]}>{t(`cmp.status.${status}`)}</Badge>;
}

/** Type badge (campaigns-restructure design §5 — type badge on each card). */
export function TypeBadge({ type }: { type: BusinessCampaignType }) {
  const t = useT();
  return (
    <Badge tone="brand">
      {TYPE_GLYPH[type]} {t(`cmp.biz.type.${type}`)}
    </Badge>
  );
}

/** Voucher-status pill. */
export function VoucherStatusPill({ status }: { status: CampaignVoucherStatus }) {
  const t = useT();
  return <Badge tone={VOUCHER_TONE[status]}>{t(`cmp.biz.vouch.status.${status}`)}</Badge>;
}

/** A KPI card (design `bSummary`): label, big value. */
export function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-line bg-card p-[18px]">
      <div className="text-[12.5px] font-semibold text-subtle">{label}</div>
      <div className="mt-2.5 font-display text-[28px] font-extrabold leading-none text-ink">
        {value}
      </div>
    </div>
  );
}

// ---- Create flow (campaigns-restructure design §6 / §6a) -------------------

// A starter template prefills type + mechanic + sensible defaults (editable in
// step 2). Config-only — a typed constant, never DB rows (design §6a Change 2).
export type CampaignTemplate = {
  id: string;
  labelKey: string;
  type: BusinessCampaignType;
  mechanic?: BusinessCampaignMechanic;
  // Field prefills applied to the create form.
  requiredCount?: number;
  groupSize?: number;
};

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  { id: "visit5", labelKey: "cmp.biz.new.tpl.visit5", type: "individual", mechanic: "visit", requiredCount: 5 },
  { id: "friends3", labelKey: "cmp.biz.new.tpl.friends3", type: "group", groupSize: 3 },
  { id: "story", labelKey: "cmp.biz.new.tpl.story", type: "social" },
];

// The single adaptive create form, kept as plain strings for the inputs. Coerced
// into a CampaignPayload by toPayload() at submit (the validated boundary).
// Item-reward selection mode (multi-form-loyalty slice 3): a preset catalog item
// vs the customer picking one at redemption.
export type ItemSelectionMode = "fixed" | "customer";

export type CampaignForm = {
  type: BusinessCampaignType;
  mechanic: BusinessCampaignMechanic;
  name: string;
  // individual
  requiredCount: string;
  // group
  groupSize: string;
  checkinWindow: string;
  // social
  instagram: string;
  // reward
  rewardTitle: string;
  // Item-reward selection for the campaign reward.
  itemSelection: ItemSelectionMode;
  catalogItemId: string;
  // limits
  maxParticipants: string;
  repeatable: boolean;
};

export const CAMPAIGN_FORM_DEFAULT: CampaignForm = {
  type: "individual",
  mechanic: "visit",
  name: "",
  requiredCount: "5",
  groupSize: "3",
  checkinWindow: "15",
  instagram: "",
  rewardTitle: "",
  itemSelection: "customer",
  catalogItemId: "",
  maxParticipants: "1000",
  repeatable: false,
};

/** Apply a starter template's prefills onto the default form (design §6a). */
export function applyTemplate(tpl: CampaignTemplate): CampaignForm {
  return {
    ...CAMPAIGN_FORM_DEFAULT,
    type: tpl.type,
    mechanic: tpl.mechanic ?? "visit",
    requiredCount: tpl.requiredCount != null ? String(tpl.requiredCount) : CAMPAIGN_FORM_DEFAULT.requiredCount,
    groupSize: tpl.groupSize != null ? String(tpl.groupSize) : CAMPAIGN_FORM_DEFAULT.groupSize,
  };
}

const num = (v: string): number | null => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Coerce the string-backed create form into the typed CampaignPayload sent to the
 * service (the codebase's adapter idiom in place of zod). Only the fields the
 * chosen type/mechanic uses are sent so the backend never receives stray values.
 */
export function toPayload(form: CampaignForm): CampaignPayload {
  const base: CampaignPayload = {
    type: form.type,
    name: form.name.trim(),
    reward_title: form.rewardTitle.trim(),
    max_participants: num(form.maxParticipants),
    repeat_policy: form.repeatable ? "repeatable" : "once",
  };
  if (form.type === "group") {
    base.required_group_size = num(form.groupSize);
    base.group_checkin_window_minutes = num(form.checkinWindow);
  } else if (form.type === "individual") {
    base.mechanic = "visit";
    base.required_count = num(form.requiredCount);
    base.item_selection = form.itemSelection;
    base.catalog_item_id =
      form.itemSelection === "fixed" ? form.catalogItemId || null : null;
  } else if (form.type === "social") {
    base.instagram_handle = form.instagram.trim() || null;
  }
  return base;
}

/**
 * Client-side create validation mirroring the backend publish rules (UX-only; the
 * service is the authority). Returns the first failing i18n key, or null when valid.
 * Pure & framework-free so it is unit-testable.
 */
export function createError(form: CampaignForm): string | null {
  if (!form.name.trim()) return "cmp.biz.form.invalid.name";
  if (!form.rewardTitle.trim()) return "cmp.biz.form.invalid.reward";
  if (
    form.type === "individual" &&
    form.itemSelection === "fixed" &&
    !form.catalogItemId
  ) {
    return "cmp.biz.form.invalid.item";
  }
  return null;
}
