"use client";

import type {
  Campaign,
  CampaignStatus,
  CampaignType,
  CampaignVoucher,
  CampaignVoucherStatus,
  GroupSessionMember,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge, cn } from "@jaqyn/ui";
import Link from "next/link";
import { useState } from "react";
import QRCode from "react-qr-code";

// Shared campaign vocabulary, lifted from "Jaqyn Campaign Rewards.dc.html"
// (warm terracotta / cream / sage tokens). Primitives compose from @jaqyn/ui +
// app/_components/kit. Copy goes through @jaqyn/i18n.

type Translate = ReturnType<typeof useT>;

/** Status → Badge tone, mirroring the design's status pills. */
const STATUS_TONE: Record<CampaignStatus, "brand" | "ok" | "neutral" | "warn" | "danger"> = {
  active: "ok",
  scheduled: "warn",
  paused: "warn",
  ended: "neutral",
  cancelled: "danger",
  draft: "neutral",
};

/** Campaign type → Badge tone, glyph, and left-accent stripe. Group vs
 * Individual (vs Social) must read at a glance in the discover feed: green for
 * group, amber for individual, terracotta for social. */
const TYPE_TONE: Record<CampaignType, "ok" | "warn" | "brand"> = {
  group: "ok",
  individual: "warn",
  social: "brand",
};
const TYPE_GLYPH: Record<CampaignType, string> = {
  group: "👥",
  individual: "👤",
  social: "📸",
};
const TYPE_ACCENT: Record<CampaignType, string> = {
  group: "border-l-sage",
  individual: "border-l-amber",
  social: "border-l-brand",
};

/** Voucher status → Badge tone. */
const VOUCHER_TONE: Record<CampaignVoucherStatus, "ok" | "neutral" | "danger"> = {
  active: "ok",
  redeemed: "neutral",
  expired: "danger",
  // Cancelled is staff/admin-initiated (not the same severity as a past-due
  // expiry); neutral keeps it visually distinct from the expired danger tone.
  cancelled: "neutral",
};

/** Human "challenge" line per campaign type/mechanic (design `cd.mission`). */
export function missionLine(t: Translate, c: Campaign): string {
  if (c.campaign_type === "group") {
    return t("cmp.mission.group").replace("{size}", String(c.rule.required_group_size ?? 0));
  }
  if (c.campaign_type === "social") {
    return t("cmp.mission.social").replace("{handle}", c.instagram_handle ?? "");
  }
  if (c.rule.mechanic === "spend") {
    return t("cmp.mission.spend").replace("{amount}", c.rule.required_spend ?? "");
  }
  return t("cmp.mission.visit").replace("{count}", String(c.rule.required_count ?? 0));
}

/** "Ends in" copy from days_left + status (design `endsLabel`). */
function endsLabel(t: Translate, c: Pick<Campaign, "days_left" | "status">): string {
  if (c.status === "ended" || c.status === "cancelled") return t("cmp.card.ended");
  if (c.days_left <= 0) return t("cmp.card.endsToday");
  return t("cmp.card.endsIn").replace("{days}", String(c.days_left));
}

/** Ordered "how it works" steps per campaign type (design `cd.steps`). */
export function howItWorks(t: Translate, type: CampaignType): string[] {
  if (type === "group") {
    return [
      t("cmp.step.groupInvite"),
      t("cmp.step.groupArrive"),
      t("cmp.step.groupStaff"),
      t("cmp.step.groupLeader"),
    ];
  }
  return [t("cmp.step.join"), t("cmp.step.showQr"), t("cmp.step.staffScans"), t("cmp.step.unlock")];
}

/** Rule bullets shown on the detail screen (design `cd.rules`). */
export function ruleLines(t: Translate, c: Campaign): string[] {
  const r = c.rule;
  const lines: string[] = [];
  if (c.campaign_type === "group") {
    if (r.required_group_size != null)
      lines.push(t("cmp.rule.groupSize").replace("{size}", String(r.required_group_size)));
    if (r.group_checkin_window)
      lines.push(t("cmp.rule.checkin").replace("{window}", r.group_checkin_window));
  } else if (c.campaign_type === "individual") {
    if (r.mechanic === "spend" && r.required_spend != null) {
      lines.push(t("cmp.mission.spend").replace("{amount}", r.required_spend));
    } else if (r.required_count != null) {
      lines.push(t("cmp.rule.visits").replace("{count}", String(r.required_count)));
    }
    if (r.max_count_per_day != null)
      lines.push(t("cmp.rule.perDay").replace("{count}", String(r.max_count_per_day)));
    if (r.min_time_between) lines.push(t("cmp.rule.minGap").replace("{gap}", r.min_time_between));
  }
  if (c.active_days || c.active_hours)
    lines.push(
      t("cmp.rule.window").replace("{days}", c.active_days).replace("{hours}", c.active_hours),
    );
  lines.push(t(c.repeat_policy === "repeatable" ? "cmp.rule.repeatable" : "cmp.rule.repeatOnce"));
  return lines;
}

/**
 * Glyph tile (emoji on a warm-cream square), matching the design's icon chips.
 * When `image` is set (a business logo at /media/...), the photo takes
 * precedence over the glyph. Plain <img> so the same-origin /media/ rewrite works.
 */
export function GlyphTile({
  glyph,
  size = 50,
  image,
}: {
  glyph: string;
  size?: number;
  image?: string | null;
}) {
  const [imgError, setImgError] = useState(false);
  const radius = Math.round(size * 0.3);
  if (image && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className="flex-none object-cover"
        style={{ width: size, height: size, borderRadius: radius }}
        aria-hidden
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      className="flex flex-none items-center justify-center bg-brand-muted"
      style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.5 }}
      aria-hidden
    >
      {glyph}
    </div>
  );
}

/** Discover-list card: glyph, name+status, blurb, progress, reward + CTA. */
export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const t = useT();
  const type = campaign.campaign_type;
  const p = campaign.my_progress;
  const target = p?.target_count ?? campaign.rule.required_count ?? 0;
  // Only individual campaigns track per-customer visit/stamp/spend progress.
  // Group "progress" is people-joining (shown inside the group flow, not here).
  const hasProgress = type === "individual" && !!p?.joined && target > 0;
  // CTA differs by type/state: group cards always "View" the offer; an
  // in-progress individual says "Continue"; otherwise "View"/"Join".
  const cta =
    type === "group" || p?.completed
      ? t("cmp.card.view")
      : hasProgress
        ? t("cmp.card.continue")
        : t("cmp.card.join");

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className={cn(
        "block rounded-2xl border border-line border-l-4 bg-card p-4 shadow-card transition active:scale-[.99]",
        TYPE_ACCENT[type],
      )}
    >
      <div className="flex items-center gap-3">
        <GlyphTile glyph={campaign.glyph} image={campaign.business.logo_url} />
        <div className="min-w-0 flex-1">
          <span className="font-display text-base font-bold text-ink">{campaign.name}</span>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={TYPE_TONE[type]} className="gap-1">
              <span aria-hidden>{TYPE_GLYPH[type]}</span>
              {t(`cmp.type.${type}`)}
            </Badge>
            <Badge tone={STATUS_TONE[campaign.status]}>{t(`cmp.status.${campaign.status}`)}</Badge>
          </div>
          <p className="mt-1 truncate text-[12.5px] text-subtle">{campaign.business.name}</p>
        </div>
      </div>

      <p className="mt-3 text-[13.5px] leading-snug text-ink">{campaign.blurb}</p>

      {hasProgress && (
        <div className="mt-3.5">
          <div className="h-2 overflow-hidden rounded-pill bg-board">
            <div
              className="h-full rounded-pill bg-brand transition-[width] duration-700 ease-out"
              style={{ width: `${Math.min(100, Math.round(((p?.current_count ?? 0) / target) * 100))}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs font-semibold text-subtle">
            <span>
              {t("cmp.card.progress")
                .replace("{count}", String(p?.current_count ?? 0))
                .replace("{total}", String(target))}
            </span>
            <span>{endsLabel(t, campaign)}</span>
          </div>
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between border-t border-line pt-3">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand">
          <span aria-hidden>🎁</span>
          {campaign.reward.title}
        </span>
        <span className="text-[13px] font-bold text-brand">{cta} ›</span>
      </div>
    </Link>
  );
}

/**
 * Compact card for the horizontal "From places you go" carousel: glyph, name,
 * business, terracotta progress bar, "{x}/{y} visits", "Ends in {n} days" and a
 * reward chip. Used only for joined / in-progress campaigns, so a fixed width is
 * fine — the parent scrolls horizontally.
 */
export function CampaignCarouselCard({ campaign }: { campaign: Campaign }) {
  const t = useT();
  const p = campaign.my_progress;
  const target = p?.target_count ?? campaign.rule.required_count ?? 0;
  const current = p?.current_count ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="flex w-[230px] flex-none flex-col rounded-2xl border border-line bg-card p-4 shadow-card transition active:scale-[.99]"
    >
      <div className="flex items-center gap-2.5">
        <GlyphTile glyph={campaign.glyph} size={42} image={campaign.business.logo_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold text-ink">{campaign.name}</p>
          <p className="truncate text-[12px] text-subtle">{campaign.business.name}</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-pill bg-board">
          <div
            className="h-full rounded-pill bg-brand transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px] font-semibold text-subtle">
          <span>
            {t("cmp.card.progress")
              .replace("{count}", String(current))
              .replace("{total}", String(target))}
          </span>
          <span>{endsLabel(t, campaign)}</span>
        </div>
      </div>

      <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-pill bg-brand-muted px-2.5 py-1 text-[12px] font-bold text-brand">
        <span aria-hidden>🎁</span>
        <span className="truncate">{campaign.reward.title}</span>
      </span>
    </Link>
  );
}

/** Active-voucher card in the wallet (design `activeVouchers`). */
export function VoucherCard({ voucher }: { voucher: CampaignVoucher }) {
  const t = useT();
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <GlyphTile glyph={voucher.glyph} size={46} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-subtle">{voucher.business.name}</p>
          <p className="mt-0.5 font-display text-lg font-extrabold leading-tight tracking-tight text-ink">
            {voucher.reward_title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-subtle">{voucher.campaign.name}</span>
            {voucher.expiring_soon ? (
              <Badge tone="warn">{t("cmp.wallet.expiringSoon")}</Badge>
            ) : (
              <span className="text-[11.5px] text-subtle">
                {t("cmp.wallet.expires").replace("{date}", voucher.expires_label)}
              </span>
            )}
          </div>
        </div>
      </div>
      <Link
        href={`/campaign-wallet/${voucher.id}`}
        className="mt-3.5 flex w-full items-center justify-center rounded-xl bg-brand-gradient py-3 text-[15px] font-bold text-brand-fg shadow-glow transition active:scale-[.99]"
      >
        {t("cmp.wallet.showQr")}
      </Link>
    </div>
  );
}

/** Compact used/expired voucher row (design `usedVouchers` / `expiredVouchers`). */
export function VoucherRow({ voucher }: { voucher: CampaignVoucher }) {
  const t = useT();
  const dimmed = voucher.status === "expired" || voucher.status === "cancelled";
  return (
    <Link
      href={`/campaign-wallet/${voucher.id}`}
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-line bg-card p-3.5 shadow-card transition active:scale-[.99]",
        dimmed && "opacity-60",
      )}
    >
      <GlyphTile glyph={voucher.glyph} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{voucher.reward_title}</p>
        <p className="mt-0.5 truncate text-xs text-subtle">
          {voucher.business.name} · {voucher.campaign.name}
        </p>
      </div>
      <Badge tone={VOUCHER_TONE[voucher.status]}>{t(`rewards.status.${statusKey(voucher.status)}`)}</Badge>
    </Link>
  );
}

// Voucher statuses map onto label keys. `cancelled` gets its own key so the
// compact row shows "Cancelled" rather than collapsing it into "Expired".
// The `cmp.voucher.cancelledTitle` key already exists; reuse its sibling
// namespace via `rewards.status.*` which carries all voucher lifecycle labels.
function statusKey(s: CampaignVoucherStatus): "redeemed" | "expired" | "cancelled" {
  if (s === "redeemed") return "redeemed";
  if (s === "cancelled") return "cancelled";
  return "expired";
}

/** Reward QR block for the voucher view (gradient reward card + QR + code). */
export function VoucherQrBlock({
  glyph,
  rewardTitle,
  businessName,
  qrToken,
  code,
}: {
  glyph: string;
  rewardTitle: string;
  businessName: string;
  qrToken: string;
  code: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="rounded-[22px] bg-[linear-gradient(150deg,#E7A23E,#C25E3C)] px-7 py-5 text-white shadow-sage">
        <div className="text-3xl" aria-hidden>
          {glyph}
        </div>
        <p className="mt-1.5 font-display text-[22px] font-extrabold tracking-tight">{rewardTitle}</p>
        <p className="mt-0.5 text-[13px] opacity-90">{businessName}</p>
      </div>
      <div className="mt-5 rounded-[24px] border border-[#EDEDED] bg-card p-4 shadow-card">
        <QRCode value={qrToken} size={200} />
      </div>
      <p className="mt-3.5 font-mono text-[15px] font-bold tracking-[0.12em] text-ink">{code}</p>
    </div>
  );
}

/** A single group-session member row (avatar, name, status tag). */
export function GroupMemberRow({ member }: { member: GroupSessionMember }) {
  const t = useT();
  const tag = member.is_leader
    ? t("cmp.group.leaderTag")
    : member.checked_in
      ? t("cmp.group.joinedTag")
      : t("cmp.group.waitingTag");
  const tone: "brand" | "ok" | "neutral" = member.is_leader
    ? "brand"
    : member.checked_in
      ? "ok"
      : "neutral";
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-9 w-9 flex-none items-center justify-center rounded-full font-display text-sm font-bold",
          member.is_you ? "bg-brand-gradient text-brand-fg" : "bg-brand-muted text-brand",
        )}
        aria-hidden
      >
        {member.initial}
      </div>
      <span className="flex-1 truncate text-sm font-semibold text-ink">
        {member.name}
        {member.is_you ? ` · ${t("cmp.group.you")}` : ""}
      </span>
      <Badge tone={tone}>{tag}</Badge>
    </div>
  );
}
