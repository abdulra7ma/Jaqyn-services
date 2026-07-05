"use client";

/**
 * VesselHero — closest-reward hero card on the campaigns tab.
 *
 * Variants (all render the same terracotta gradient card):
 *   • visits/stamps — cup vessel with fill layer + stamp pips
 *   • group         — seat count "3/4 joined" + Invite CTA
 *   • spend goal    — progress bar + som counter (future)
 *   • points/cashback — balance + "Use cashback" CTA (future)
 *
 * The vessel fill animates via CSS `transition-[height]` at 800ms with
 * cubic-bezier(.22,1,.36,1) — no keyframe needed, just the height percentage.
 *
 * All animations are gated by `useReducedMotion()`.
 */

import type { Campaign, LoyaltyCardView } from "@jaqyn/api";
import { useReducedMotion } from "framer-motion";
import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import Link from "next/link";
import { GlyphTile } from "../../_components/campaigns";
import type { CampaignsHeroResult } from "../_lib/pickCampaignsHero";

// ---- Stamp pips ----------------------------------------------------------------

function StampPip({ filled }: { filled: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold transition",
        filled
          ? "border-white/60 bg-white text-brand"
          : "border-white/40 bg-transparent text-transparent",
      )}
    >
      {filled ? "✓" : ""}
    </span>
  );
}

// ---- Cup vessel ----------------------------------------------------------------

interface VesselCupProps {
  /** 0–100 fill percentage. */
  fillPct: number;
  current: number;
  total: number;
  reducedMotion: boolean;
}

function VesselCup({ fillPct, current, total, reducedMotion }: VesselCupProps) {
  const clampedPct = Math.min(100, Math.max(0, fillPct));
  return (
    // Cup outer: white border, rounded bottom corners, handle-notch via pseudo.
    <div className="relative" aria-hidden>
      {/* Cup body */}
      <div className="relative h-[104px] w-[82px] overflow-hidden rounded-[9px_9px_20px_20px] border-[3px] border-white/90 bg-white/20">
        {/* Fill layer — animates height. Transition disabled when reduced motion. */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 bg-white/30",
            !reducedMotion && "transition-[height] duration-[800ms]",
          )}
          style={{
            height: `${clampedPct}%`,
            // cubic-bezier applied inline since Tailwind JIT can't express arbitrary easing.
            transitionTimingFunction: reducedMotion ? undefined : "cubic-bezier(.22,1,.36,1)",
          }}
        />
        {/* Count label */}
        <span className="absolute inset-0 flex items-center justify-center font-display text-base font-bold text-white drop-shadow">
          {current}/{total}
        </span>
      </div>
      {/* Cup handle — decorative right-side bracket */}
      <div className="absolute right-[-12px] top-[18px] h-[40px] w-[12px] rounded-r-full border-[3px] border-l-0 border-white/80" />
    </div>
  );
}

// ---- Group seats variant -------------------------------------------------------

interface GroupHeroBodyProps {
  campaign: Campaign;
  joined: number;
  required: number;
}

function GroupHeroBody({ campaign, joined, required }: GroupHeroBodyProps) {
  const t = useT();
  const seats = Array.from({ length: required });

  return (
    <div className="flex items-start gap-4">
      {/* Seat pips */}
      <div className="flex flex-col items-center gap-1 pt-1" aria-hidden>
        <div className="flex flex-wrap gap-1.5">
          {seats.map((_, i) => (
            <span
              // eslint-disable-next-line react/no-array-index-key -- static count, order stable
              key={i}
              className={cn(
                "h-6 w-6 rounded-full border-2 border-white/60",
                i < joined ? "bg-white" : "bg-white/20",
              )}
            />
          ))}
        </div>
        <span className="mt-1 font-display text-2xl font-bold text-white">
          {joined}/{required}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/80">
          {t("cmp.home.hero.joined")}
        </span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
          {t("cmp.home.hero.eyebrow")}
        </p>
        <p className="mt-1 font-display text-[20px] font-bold leading-tight text-white">
          {campaign.reward.title}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <GlyphTile
            glyph={campaign.glyph || "👥"}
            image={campaign.business.logo_url}
            size={32}
          />
          <p className="min-w-0 truncate text-[13px] text-white/80">
            {campaign.business.name}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---- Main component ------------------------------------------------------------

interface VesselHeroProps {
  result: CampaignsHeroResult;
}

export function VesselHero({ result }: VesselHeroProps) {
  const t = useT();
  const reducedMotion = useReducedMotion() ?? false;

  if (result.kind === "empty") return null;

  if (result.kind === "group") {
    const href = `/campaigns/${result.campaign.id}/group`;
    return (
      <Link href={href} className="block rounded-[24px] bg-brand-gradient p-5 shadow-glow active:scale-[.99] transition">
        <GroupHeroBody
          campaign={result.campaign}
          joined={result.joined}
          required={result.required}
        />
        <div className="mt-4">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill bg-white/20 px-4 py-2 text-[13.5px] font-semibold text-white",
              !reducedMotion && "animate-jq-ask-d",
            )}
          >
            {t("cmp.home.hero.invite")} →
          </span>
        </div>
      </Link>
    );
  }

  // Stamp / visit / individual campaign variants share the cup vessel.
  const isLoyalty = result.kind === "loyalty";
  const current = result.current;
  const total = result.total;
  const remaining = result.remaining;
  const fillPct = total > 0 ? Math.round((current / total) * 100) : 0;

  const href = isLoyalty
    ? `/loyalty?business=${encodeURIComponent((result as Extract<typeof result, { kind: "loyalty" }>).card.business_id)}`
    : `/campaigns/${(result as Extract<typeof result, { kind: "campaign" }>).campaign.id}`;

  const businessName = isLoyalty
    ? (result as Extract<typeof result, { kind: "loyalty" }>).card.business_name
    : (result as Extract<typeof result, { kind: "campaign" }>).campaign.business.name;

  const rewardTitle = isLoyalty
    ? (result as Extract<typeof result, { kind: "loyalty" }>).card.reward_summary
    : (result as Extract<typeof result, { kind: "campaign" }>).campaign.reward.title;

  // Payoff line: "{remaining} more {mechanic} → {reward}"
  const mechanic = isLoyalty
    ? (result as Extract<typeof result, { kind: "loyalty" }>).card.type
    : "visit";
  const mechanicLabel =
    mechanic === "stamp"
      ? t(remaining === 1 ? "cmp.home.hero.stamp.one" : "cmp.home.hero.stamp.many")
      : t(remaining === 1 ? "cmp.home.hero.visit.one" : "cmp.home.hero.visit.many");

  const payoffLine = t("cmp.home.hero.payoff")
    .replace("{n}", String(remaining))
    .replace("{mechanic}", mechanicLabel)
    .replace("{reward}", rewardTitle);

  return (
    <Link
      href={href}
      className="block rounded-[24px] bg-brand-gradient p-5 shadow-glow active:scale-[.99] transition"
    >
      {/* Top area: cup + right text */}
      <div className="flex items-start gap-4">
        <VesselCup
          fillPct={fillPct}
          current={current}
          total={total}
          reducedMotion={reducedMotion}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
            {t("cmp.home.hero.eyebrow")}
          </p>
          <p className="mt-1 font-display text-[20px] font-bold leading-tight text-white">
            {payoffLine}
          </p>
          <p className="mt-1 text-[13px] text-white/80">{businessName}</p>
        </div>
      </div>

      {/* Stamp pips row (hidden for visit-only programs where total > 10) */}
      {total <= 10 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t("cmp.home.hero.progress")}>
          {Array.from({ length: total }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key -- static count, order stable
            <StampPip key={i} filled={i < current} />
          ))}
        </div>
      )}

      {/* CTA row */}
      <div className="mt-4">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-pill bg-white/20 px-4 py-2 text-[13.5px] font-semibold text-white",
            !reducedMotion && "animate-jq-ask",
          )}
        >
          {t("cmp.home.hero.showQr")} →
        </span>
      </div>
    </Link>
  );
}
