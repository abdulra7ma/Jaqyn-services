"use client";

import type { LoyaltyStatus, LoyaltyType } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge } from "@jaqyn/ui";

export const LOYALTY_STATUS_TONE: Record<LoyaltyStatus, "ok" | "warn" | "neutral"> = {
  active: "ok",
  paused: "warn",
  archived: "neutral",
};

export const LOYALTY_TYPE_GLYPH: Record<LoyaltyType, string> = {
  points: "💰",
  stamp: "🎯",
  visit: "🔄",
};

// Status accent-bar colors — the semantic foreground hues from the design system
// (§1 status table): live=sage, paused=amber, ended=neutral.
export const LOYALTY_STATUS_BAR: Record<LoyaltyStatus, string> = {
  active: "#3F7355",
  paused: "#B07A1E",
  archived: "#9A8B7B",
};

export function LoyaltyStatusPill({ status }: { status: LoyaltyStatus }) {
  const t = useT();
  return <Badge tone={LOYALTY_STATUS_TONE[status]}>{t(`loyalty.biz.status.${status}`)}</Badge>;
}

export function LoyaltyTypeBadge({ type }: { type: LoyaltyType }) {
  const t = useT();
  return (
    <Badge tone="brand">
      {LOYALTY_TYPE_GLYPH[type]} {t(`loyalty.biz.${type}`)}
    </Badge>
  );
}
