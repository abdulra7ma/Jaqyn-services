"use client";

import type {
  BusinessCampaignStatus,
  BusinessCampaignType,
  CampaignPayload,
  CampaignVoucherStatus,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge } from "@jaqyn/ui";

// Shared business-campaign vocabulary for the OwnerShell screens (list / wizard /
// detail), lifted from "Jaqyn Campaign Rewards.dc.html" BUSINESS section. Primitives
// compose from @jaqyn/ui; copy goes through @jaqyn/i18n. Tokens from the Tailwind
// preset — no new hex.

type Translate = ReturnType<typeof useT>;

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
  visit: "🔁",
  timewindow: "🕒",
  group: "👥",
};

/** Status pill matching the desktop table cells. */
export function StatusPill({ status }: { status: BusinessCampaignStatus }) {
  const t = useT();
  return <Badge tone={STATUS_TONE[status]}>{t(`cmp.status.${status}`)}</Badge>;
}

/** Voucher-status pill. */
export function VoucherStatusPill({ status }: { status: CampaignVoucherStatus }) {
  const t = useT();
  return <Badge tone={VOUCHER_TONE[status]}>{t(`cmp.biz.vouch.status.${status}`)}</Badge>;
}

/** A KPI card (design `bSummary`): label, big value, optional sub line. */
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

/** One-line "challenge" summary for a campaign type (design `ruleSummary`). */
export function ruleSummary(t: Translate, type: BusinessCampaignType, rule: CampaignPayload): string {
  if (type === "group") {
    return t("cmp.mission.group").replace("{size}", String(rule.required_group_size ?? 0));
  }
  if (type === "timewindow") {
    return t("cmp.mission.timewindow")
      .replace("{count}", String(rule.required_count ?? 0))
      .replace("{time}", rule.window_before_time ?? "");
  }
  return t("cmp.mission.visit").replace("{count}", String(rule.required_count ?? 0));
}

// ---- Wizard ----------------------------------------------------------------

export const WIZARD_STEPS = ["type", "rules", "reward", "limits", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const CAMPAIGN_TYPES: BusinessCampaignType[] = ["visit", "timewindow", "group"];

// Reward types mirror CampaignReward.reward_type on the backend (plan §1.1).
export const REWARD_TYPES = ["free_item", "discount", "upgrade", "custom"] as const;
export type RewardType = (typeof REWARD_TYPES)[number];

// Wizard form shape — a superset of CampaignPayload kept as plain strings for the
// inputs. Coerced to a CampaignPayload by toPayload() at submit (the boundary).
export type WizardForm = {
  type: BusinessCampaignType;
  name: string;
  description: string;
  // rules
  visits: string;
  perDay: string;
  minGap: string;
  windowBefore: string;
  groupSize: string;
  checkin: string;
  start: string;
  end: string;
  days: string;
  hours: string;
  // reward
  rewardType: RewardType;
  rewardTitle: string;
  rewardDescription: string;
  expiryDays: string;
  maxRewards: string;
  // limits
  maxParticipants: string;
  repeatPolicy: "once" | "repeatable";
  staffApproval: boolean;
};

// Defaults mirror the design's wizDefault() (Jaqyn Campaign Rewards.dc.html).
export const WIZARD_DEFAULT: WizardForm = {
  type: "visit",
  name: "",
  description: "",
  visits: "3",
  perDay: "1",
  minGap: "4 hours",
  windowBefore: "",
  groupSize: "4",
  checkin: "15 min",
  start: "",
  end: "",
  days: "Mon–Fri",
  hours: "08:00 – 12:00",
  rewardType: "free_item",
  rewardTitle: "",
  rewardDescription: "",
  expiryDays: "7", // default voucher window, design wizDefault.expiryDays
  maxRewards: "200",
  maxParticipants: "1000",
  repeatPolicy: "once",
  staffApproval: true,
};

const num = (v: string): number | null => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Coerce the string-backed wizard form into the typed CampaignPayload sent to the
 * service. This is the validated boundary (the codebase's adapter idiom in place of
 * zod); past here the payload is trusted. Rule fields irrelevant to the chosen type
 * are omitted so the backend doesn't receive stray values.
 */
export function toPayload(form: WizardForm): CampaignPayload {
  const base: CampaignPayload = {
    type: form.type,
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    start_at: form.start.trim() || undefined,
    end_at: form.end.trim() || undefined,
    active_days: form.days.trim() || undefined,
    active_hours: form.hours.trim() || undefined,
    reward_type: form.rewardType,
    reward_title: form.rewardTitle.trim(),
    reward_description: form.rewardDescription.trim() || undefined,
    expiry_days_after_unlock: num(form.expiryDays) ?? undefined,
    max_rewards: num(form.maxRewards),
    max_participants: num(form.maxParticipants),
    repeat_policy: form.repeatPolicy,
    staff_approval_required: form.staffApproval,
  };
  if (form.type === "group") {
    base.required_group_size = num(form.groupSize);
    base.group_checkin_window = form.checkin.trim() || null;
  } else {
    base.required_count = num(form.visits);
    base.max_count_per_day = num(form.perDay);
    base.min_time_between = form.minGap.trim() || null;
    if (form.type === "timewindow") base.window_before_time = form.windowBefore.trim() || null;
  }
  return base;
}

/**
 * Client-side publish validation mirroring the backend publish rules (plan §23):
 * a name, a reward title, a positive reward cap, a valid completion target for the
 * type, and an end after start. The service is the authority — this is UX-only and
 * returns the first failing i18n key (or null when valid). Pure & framework-free so
 * it is unit-testable.
 */
export function publishError(form: WizardForm): string | null {
  if (!form.name.trim()) return "cmp.biz.wiz.invalid.name";
  if (form.type === "group") {
    const size = num(form.groupSize);
    if (size == null || size < 2) return "cmp.biz.wiz.invalid.groupSize";
  } else {
    const count = num(form.visits);
    if (count == null || count < 1) return "cmp.biz.wiz.invalid.count";
  }
  if (!form.rewardTitle.trim()) return "cmp.biz.wiz.invalid.reward";
  const max = num(form.maxRewards);
  if (max == null || max < 1) return "cmp.biz.wiz.invalid.maxRewards";
  // Dates are free-text in the design; only enforce ordering when both parse.
  const startT = Date.parse(form.start);
  const endT = Date.parse(form.end);
  if (!Number.isNaN(startT) && !Number.isNaN(endT) && endT <= startT) {
    return "cmp.biz.wiz.invalid.dates";
  }
  return null;
}
