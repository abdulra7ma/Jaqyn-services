"use client";

import {
  useCampaignCatalog,
  useRedeemPoints,
  useSelectVoucherItem,
  type BusinessLoyaltyProgram,
  type Campaign,
  type CampaignCatalogItem,
  type CampaignStatus,
  type CampaignType,
  type CampaignVoucher,
  type CampaignVoucherStatus,
  type GroupSessionMember,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge, cn } from "@jaqyn/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  // Only individual visit/stamp/spend campaigns track a per-customer target
  // progress bar. Group "progress" is people-joining (shown in the group flow);
  // POINTS programs accrue a balance (no target bar).
  const hasProgress =
    type === "individual" && campaign.rule.mechanic !== "points" && !!p?.joined && target > 0;
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
  const isPoints = campaign.rule.mechanic === "points";
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

      {isPoints ? (
        // POINTS programs show a balance, not a visit progress bar.
        <div className="mt-3 flex items-center justify-between">
          <span className="rounded-pill bg-brand-muted px-2.5 py-1 text-[12.5px] font-bold text-brand">
            {t("cmp.loyalty.points").replace("{count}", String(p?.points_balance ?? 0))}
          </span>
          <span className="text-[12px] font-semibold text-subtle">{endsLabel(t, campaign)}</span>
        </div>
      ) : (
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
      )}

      <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-pill bg-brand-muted px-2.5 py-1 text-[12px] font-bold text-brand">
        <span aria-hidden>🎁</span>
        <span className="truncate">{campaign.reward.title}</span>
      </span>
    </Link>
  );
}

/**
 * One business loyalty program row for the business-page "Loyalty" section
 * (multi-form-loyalty slice 2). POINTS programs show a balance + cashback hint;
 * visit/stamp/spend programs show an X/Y progress bar + the reward line. The whole
 * row links into the campaign detail (join / continue / redeem). Tokens-only.
 */
export function LoyaltyProgramRow({ program }: { program: BusinessLoyaltyProgram }) {
  const t = useT();
  const isPoints = program.mechanic === "points";
  // Non-points programs render a progress bar against their target.
  const target = program.target > 0 ? program.target : 0;
  const pct =
    target > 0 ? Math.min(100, Math.round((program.progress_count / target) * 100)) : 0;
  // POINTS: show "Redeem cashback" only once there is a balance to spend.
  const canRedeem = isPoints && program.points_balance > 0;
  const cta = canRedeem
    ? t("cmp.loyalty.redeem")
    : program.joined
      ? t("cmp.card.continue")
      : t("cmp.card.join");

  return (
    <Link
      href={`/campaigns/${program.campaign_id}`}
      className="block rounded-2xl border border-line bg-card p-4 shadow-card transition active:scale-[.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold text-ink">{program.name}</p>
          {program.reward_summary && (
            <p className="mt-0.5 truncate text-[12.5px] font-semibold text-brand">
              {program.reward_summary}
            </p>
          )}
        </div>
        {isPoints && (
          <span className="flex-none rounded-pill bg-brand-muted px-2.5 py-1 text-[12.5px] font-bold text-brand">
            {t("cmp.loyalty.points").replace("{count}", String(program.points_balance))}
          </span>
        )}
      </div>

      {isPoints ? (
        <p className="mt-2 text-[12.5px] text-subtle">
          {canRedeem && program.cashback_per_point
            ? t("cmp.loyalty.cashbackHint").replace("{rate}", program.cashback_per_point)
            : t("cmp.loyalty.pointsHint")}
        </p>
      ) : (
        target > 0 && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-pill bg-board">
              <div
                className="h-full rounded-pill bg-brand transition-[width] duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-[12px] font-semibold text-subtle">
              {t("cmp.card.progress")
                .replace("{count}", String(program.progress_count))
                .replace("{total}", String(target))}
            </p>
          </div>
        )
      )}

      <div className="mt-3 flex items-center justify-end border-t border-line pt-2.5">
        <span className="text-[13px] font-bold text-brand">{cta} ›</span>
      </div>
    </Link>
  );
}

/**
 * A single loyalty program flattened for the consolidated business card
 * (multi-form-loyalty). One card aggregates every program a business runs; the
 * card's switcher flips between these views. Mechanic may be null when the source
 * is an arbitrary Campaign whose rule has no mechanic (group/social) — such a view
 * falls back to the program name for its tab label and shows a progress body.
 */
export type LoyaltyProgramView = {
  campaignId: string;
  name: string;
  mechanic: "points" | "stamp" | "visit" | "spend" | null;
  rewardSummary: string;
  joined: boolean;
  progressCount: number;
  target: number;
  pointsBalance: number;
  cashbackPerPoint: string | null;
};

/**
 * Short per-program tab label for the loyalty switcher (multi-form-loyalty). Maps
 * the mechanic to a stable namespaced i18n key (cmp.loyalty.tab.*); when the
 * mechanic is null (non-points/visit/stamp/spend) it falls back to the program's
 * own name so the tab is never blank.
 */
export function loyaltyTabLabel(
  t: Translate,
  mechanic: LoyaltyProgramView["mechanic"],
  name: string,
): string {
  if (mechanic === null) return name;
  return t(`cmp.loyalty.tab.${mechanic}` as Parameters<Translate>[0]);
}

/** Loyalty type → pill label key + tone classes (matches the design's chips). */
const LOYALTY_PILL: Record<
  NonNullable<LoyaltyProgramView["mechanic"]>,
  { key: string; cls: string }
> = {
  stamp: { key: "cmp.loyalty.pill.stamp", cls: "bg-brand-muted text-brand" },
  points: { key: "cmp.loyalty.pill.cashback", cls: "bg-amber/15 text-amber-deep" },
  visit: { key: "cmp.loyalty.pill.visits", cls: "bg-sage-soft text-ok" },
  spend: { key: "cmp.loyalty.pill.spend", cls: "bg-amber/15 text-amber-deep" },
};

/** A row of stamp/visit dots: `filled` solid, the rest dashed outlines. */
function ProgressDots({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-6 w-6 rounded-full",
            i < filled ? "bg-brand" : "border-2 border-dashed border-line",
          )}
        />
      ))}
    </div>
  );
}

/** Body for the active program inside a BusinessLoyaltyCard. Type-specific:
 * stamp/visit show a dot row + "X of Y" + "N to go"; points shows the cashback
 * balance in som + a "Use" button; spend keeps a progress bar. */
function LoyaltyProgramBody({ program }: { program: LoyaltyProgramView }) {
  const t = useT();
  const mech = program.mechanic;
  const isPoints = mech === "points";
  const isStamp = mech === "stamp";
  const isVisit = mech === "visit";
  const target = program.target > 0 ? program.target : 0;
  const current = Math.max(0, Math.min(program.progressCount, target || program.progressCount));
  const toGo = Math.max(0, target - current);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  // Dots only read well for small targets; larger ones fall back to a bar.
  const useDots = (isStamp || isVisit) && target > 0 && target <= 14;
  // Cashback shown in som = balance × rate (display only; backend is authoritative).
  const som = program.cashbackPerPoint
    ? Math.round(Number(program.cashbackPerPoint) * program.pointsBalance)
    : program.pointsBalance;
  const pill = mech ? LOYALTY_PILL[mech] : null;

  return (
    <div>
      {/* reward line + type pill */}
      <div className="flex items-start justify-between gap-3">
        {program.rewardSummary && (
          <p className="min-w-0 flex-1 text-[13px] font-semibold text-subtle">
            {program.rewardSummary}
          </p>
        )}
        {pill && (
          <span
            className={cn(
              "flex-none rounded-pill px-2.5 py-1 text-[11.5px] font-bold",
              pill.cls,
            )}
          >
            {t(pill.key as Parameters<Translate>[0])}
          </span>
        )}
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {isPoints ? (
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-ink">
              <span className="text-[28px] font-extrabold text-ok">{som}</span>{" "}
              <span className="text-[13px] font-bold text-subtle">
                {t("cmp.loyalty.somCashback")}
              </span>
            </p>
            {program.pointsBalance > 0 ? (
              <Link
                href={`/campaigns/${program.campaignId}`}
                className="flex-none rounded-xl bg-sage px-5 py-2.5 text-[14px] font-bold text-white shadow-sage transition active:scale-[.98]"
              >
                {t("cmp.loyalty.use")}
              </Link>
            ) : (
              <span className="flex-none text-[12px] font-semibold text-subtle">
                {t("cmp.loyalty.pointsHint")}
              </span>
            )}
          </div>
        ) : useDots ? (
          <>
            <ProgressDots filled={current} total={target} />
            <div className="mt-3 flex items-center justify-between text-[13px] font-semibold">
              <span className="text-ink">
                {t(isStamp ? "cmp.loyalty.stamps" : "cmp.loyalty.visitsCount")
                  .replace("{count}", String(current))
                  .replace("{total}", String(target))}
              </span>
              <Link href={`/campaigns/${program.campaignId}`} className="text-brand">
                {!program.joined
                  ? `${t("cmp.card.join")} ›`
                  : t(isStamp ? "cmp.loyalty.toGo" : "cmp.loyalty.visitsToGo").replace(
                      "{count}",
                      String(toGo),
                    )}
              </Link>
            </div>
          </>
        ) : (
          // spend (money target) or large-target fallback: progress bar.
          <>
            <div className="h-2 overflow-hidden rounded-pill bg-board">
              <div
                className="h-full rounded-pill bg-brand transition-[width] duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[12.5px] font-semibold">
              <span className="text-subtle">
                {t("cmp.card.progress")
                  .replace("{count}", String(current))
                  .replace("{total}", String(target))}
              </span>
              <Link href={`/campaigns/${program.campaignId}`} className="text-brand">
                {program.joined ? `${t("cmp.card.continue")} ›` : `${t("cmp.card.join")} ›`}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The consolidated per-business loyalty card (multi-form-loyalty). Renders one
 * card for a business with a header (logo + name) and, when the business runs more
 * than one program, a keyboard-accessible segmented-tabs switcher (role=tablist /
 * tab / tabpanel) to flip between programs; a single program renders without tabs.
 * Each program body's primary affordance is a Link into the campaign detail.
 * Shown on both the business page and the Rewards "In progress" row.
 */
export function BusinessLoyaltyCard({
  business,
  programs,
}: {
  business: { name: string; logo_url: string | null };
  programs: LoyaltyProgramView[];
}) {
  const t = useT();
  const [active, setActive] = useState(0);
  // `current` is the active program; the fallback to programs[0] keeps the type
  // non-optional (the early return below guards the empty case).
  const current = programs[Math.min(active, programs.length - 1)] ?? programs[0];
  const multi = programs.length > 1;
  if (!current) return null;

  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-card">
      <div className="flex items-center gap-2.5">
        <GlyphTile glyph="🏷️" size={42} image={business.logo_url} />
        <p className="min-w-0 flex-1 truncate font-display text-[15px] font-bold text-ink">
          {business.name}
        </p>
      </div>

      {multi && (
        <div
          role="tablist"
          aria-label={business.name}
          className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {programs.map((p, i) => {
            const selected = i === active;
            return (
              <button
                key={p.campaignId}
                type="button"
                role="tab"
                id={`loyalty-tab-${p.campaignId}`}
                aria-selected={selected}
                aria-controls={`loyalty-panel-${p.campaignId}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") {
                    e.preventDefault();
                    setActive((i + 1) % programs.length);
                  } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    setActive((i - 1 + programs.length) % programs.length);
                  }
                }}
                className={cn(
                  "flex-none rounded-pill border px-3.5 py-1.5 text-[13px] font-semibold transition",
                  selected
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-line bg-card text-subtle active:scale-[.98]",
                )}
              >
                {loyaltyTabLabel(t, p.mechanic, p.name)}
              </button>
            );
          })}
        </div>
      )}

      <div
        role={multi ? "tabpanel" : undefined}
        id={multi ? `loyalty-panel-${current.campaignId}` : undefined}
        aria-labelledby={multi ? `loyalty-tab-${current.campaignId}` : undefined}
        className="mt-3"
      >
        <LoyaltyProgramBody program={current} />
      </div>
    </div>
  );
}

/**
 * Points balance + "Redeem cashback" surface for a POINTS campaign detail
 * (multi-form-loyalty slice 3). The customer enters how many points to redeem
 * (defaulting to the full balance) and sees the resulting cashback at the
 * campaign's rate; redeeming mints a cashback voucher and routes to the wallet.
 * Only meaningful for an individual `points` campaign — callers gate on that.
 */
export function PointsRedeemCard({ campaign }: { campaign: Campaign }) {
  const t = useT();
  const router = useRouter();
  const redeem = useRedeemPoints();
  const balance = campaign.my_progress?.points_balance ?? 0;
  const rate = campaign.rule.cashback_per_point;
  const [amount, setAmount] = useState(String(balance));

  const requested = Number.parseInt(amount, 10);
  const valid = Number.isFinite(requested) && requested > 0 && requested <= balance;
  // Estimated cashback at the campaign's som-per-point rate (display only; the
  // backend computes the authoritative amount).
  const estimate =
    valid && rate ? (requested * Number.parseFloat(rate)).toFixed(2).replace(/\.00$/, "") : null;

  const onRedeem = () => {
    if (!valid) return;
    redeem.mutate(
      { campaignId: campaign.id, points: requested },
      {
        onSuccess: (voucher) => router.push(`/campaign-wallet/${voucher.id}`),
      },
    );
  };

  return (
    <div className="mt-4 rounded-[18px] border border-line bg-card p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-subtle">{t("cmp.loyalty.balance")}</span>
        <span className="font-display text-[20px] font-extrabold text-ink">
          {t("cmp.loyalty.points").replace("{count}", String(balance))}
        </span>
      </div>
      {balance > 0 ? (
        <>
          <label className="mt-3 block">
            <span className="text-[12px] font-bold text-subtle">{t("cmp.loyalty.redeemAmount")}</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              max={balance}
              min={1}
              className="mt-1.5 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-brand"
            />
          </label>
          {estimate && (
            <p className="mt-2 text-[12.5px] font-semibold text-sage">
              {t("cmp.loyalty.cashbackEstimate").replace("{amount}", estimate)}
            </p>
          )}
          {redeem.isError && (
            <p className="mt-2 text-[12.5px] font-semibold text-danger">{t("cmp.loyalty.redeemError")}</p>
          )}
          <button
            type="button"
            onClick={onRedeem}
            disabled={!valid || redeem.isPending}
            className="mt-3 w-full rounded-xl bg-brand-gradient py-3.5 text-[14.5px] font-bold text-brand-fg shadow-glow transition active:scale-[.99] disabled:opacity-60"
          >
            {redeem.isPending ? t("cmp.loyalty.redeeming") : t("cmp.loyalty.redeem")}
          </button>
        </>
      ) : (
        <p className="mt-2 text-[12.5px] text-subtle">{t("cmp.loyalty.pointsHint")}</p>
      )}
    </div>
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
          {/* Cashback amount / chosen item line (multi-form-loyalty slice 3). */}
          {voucher.cashback_amount && (
            <p className="mt-0.5 text-[13px] font-bold text-sage">
              {t("cmp.loyalty.cashbackAmount").replace("{amount}", voucher.cashback_amount)}
            </p>
          )}
          {voucher.catalog_item && (
            <p className="mt-0.5 text-[13px] font-semibold text-brand">{voucher.catalog_item.name}</p>
          )}
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

/**
 * "Choose your item" sheet for a customer-choice item voucher (multi-form-loyalty
 * slice 3). Lists the campaign's eligible CatalogItems and, on tap, resolves the
 * voucher via select-item. Shown only while the voucher has no catalog_item yet.
 */
export function VoucherItemSheet({
  campaignId,
  voucherId,
  onSelected,
}: {
  campaignId: string;
  voucherId: string;
  onSelected?: (voucher: CampaignVoucher) => void;
}) {
  const t = useT();
  const catalog = useCampaignCatalog(campaignId);
  const select = useSelectVoucherItem();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const onPick = (item: CampaignCatalogItem) => {
    setPendingId(item.id);
    select.mutate(
      { voucherId, catalogItemId: item.id },
      {
        onSuccess: (voucher) => onSelected?.(voucher),
        onSettled: () => setPendingId(null),
      },
    );
  };

  return (
    <section aria-labelledby="choose-item-heading" className="mt-2">
      <h2
        id="choose-item-heading"
        className="font-display text-base font-bold text-ink"
      >
        {t("cmp.voucher.chooseItem")}
      </h2>
      <p className="mt-1 text-[13px] text-subtle">{t("cmp.voucher.chooseItemHint")}</p>

      {catalog.isLoading && (
        <p className="mt-4 text-sm text-subtle">{t("common.loading")}</p>
      )}
      {catalog.isError && (
        <p className="mt-4 text-sm text-danger">{t("cmp.voucher.chooseItemError")}</p>
      )}
      {catalog.data && catalog.data.length === 0 && (
        <p className="mt-4 text-sm text-subtle">{t("cmp.voucher.chooseItemEmpty")}</p>
      )}

      <ul className="mt-4 flex flex-col gap-2.5">
        {(catalog.data ?? []).map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item)}
              disabled={select.isPending}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-card p-3.5 text-left shadow-card transition active:scale-[.99] disabled:opacity-60"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{item.name}</span>
              {item.price && (
                <span className="flex-none text-sm font-bold text-brand">{item.price}</span>
              )}
              <span className="flex-none text-[13px] font-bold text-brand">
                {pendingId === item.id ? t("cmp.voucher.choosing") : t("cmp.voucher.choose")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
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
