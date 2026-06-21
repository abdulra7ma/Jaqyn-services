"use client";

import type { Business, GroupOffer, RewardProgress } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge } from "@jaqyn/ui";
import Link from "next/link";
import { CoverTag, OfferCover, dealEmoji } from "./groups";
import { InitialTile, StampRow } from "./kit";

const REWARD_TONE = {
  active: "brand",
  unlocked: "ok",
  redeemed: "neutral",
  expired: "danger",
} as const;

export function RewardCard({ progress }: { progress: RewardProgress }) {
  const t = useT();
  const { reward_program: prog, business } = progress;
  const target = progress.target_count ?? prog.required_count ?? 0;
  const label = business.name || prog.title;
  return (
    <Link
      href={`/rewards/${progress.id}`}
      className="block rounded-2xl border border-line bg-card p-4 shadow-card transition active:scale-[.99]"
    >
      <div className="flex items-center gap-3">
        <InitialTile name={label} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink">{label}</p>
          <p className="truncate text-xs text-subtle">{prog.title}</p>
        </div>
        <Badge tone={REWARD_TONE[progress.status]}>{t(`rewards.status.${progress.status}`)}</Badge>
      </div>
      {target > 0 && (
        <div className="mt-4">
          <StampRow current={progress.current_count} target={target} />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-subtle">
          {progress.status === "unlocked"
            ? `🎁 ${prog.reward_description}`
            : progress.status === "redeemed"
              ? `✓ ${prog.reward_description}`
              : `${t("rewards.progress")}: ${progress.current_count}/${target || "—"}`}
        </span>
        <span className="text-xs font-bold text-brand">{t("common.continue")} ›</span>
      </div>
    </Link>
  );
}

export function GroupOfferCard({ offer }: { offer: GroupOffer }) {
  const t = useT();
  return (
    <Link
      href={`/group-offers/${offer.id}`}
      className="block overflow-hidden rounded-2xl border border-line bg-card shadow-card transition hover:border-brand active:scale-[.99]"
    >
      <OfferCover
        emoji={dealEmoji(offer)}
        className="h-28 rounded-none"
        topLeft={<CoverTag>{t(`groups.type.${offer.reward_type}`)}</CoverTag>}
        topRight={<CoverTag tone="amber">{t("groups.beTheFirst")}</CoverTag>}
      />
      <div className="p-4">
        <p className="truncate text-xs text-subtle">
          <span className="font-semibold text-ink">{offer.business.name}</span>
          {offer.business.area ? ` · ${offer.business.area}` : ""}
        </p>
        <p className="mt-0.5 font-display font-bold leading-snug text-ink">{offer.title}</p>
        <div className="mt-2 flex items-center gap-3 text-xs text-subtle">
          <span className="inline-flex items-center gap-1">
            👥 {offer.min_group_size}
            {offer.max_group_size ? `–${offer.max_group_size}` : "+"} {t("groups.peopleShort")}
          </span>
          <span className="inline-flex items-center gap-1">
            🕐 {offer.time_start}–{offer.time_end}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-brand">{offer.reward_description}</span>
          <span className="text-sm font-semibold text-brand">{t("groups.view")} ›</span>
        </div>
      </div>
    </Link>
  );
}

export function BusinessCard({ business }: { business: Business }) {
  const t = useT();
  return (
    <Link
      href={`/nearby/${business.id}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-card transition active:scale-[.99]"
    >
      <InitialTile name={business.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-ink">{business.name}</p>
        <p className="truncate text-xs text-subtle">{business.area} · {business.address}</p>
      </div>
      {business.distance_km != null && (
        <span className="shrink-0 text-xs font-semibold text-subtle">
          {business.distance_km} {t("nearby.distance")}
        </span>
      )}
    </Link>
  );
}
