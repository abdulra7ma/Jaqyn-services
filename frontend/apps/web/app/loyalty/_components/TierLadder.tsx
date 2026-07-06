import type { LoyaltyCardView, LoyaltyTier } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";

/** Trim trailing decimal zeros from a backend percent string ("5.00" → "5"). */
function pct(value: string): string {
  const n = Number(value);
  return Number.isNaN(n) ? value : String(n);
}

/** Progress (0–100) through the current rung's segment toward the next rung.
 * Full when the customer is off-ladder or already at the top. */
function segmentProgress(program: LoyaltyCardView): number {
  const { tiers, visits_count: visits, next_tier_name } = program;
  const next = tiers.find((t) => t.name === next_tier_name);
  if (!next) return 100;
  const current = [...tiers].reverse().find((t) => t.min_visits <= visits);
  const from = current?.min_visits ?? 0;
  const span = next.min_visits - from;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((visits - from) / span) * 100)));
}

function TierRow({
  tier,
  state,
  isLast,
}: {
  tier: LoyaltyTier;
  state: "reached" | "current" | "locked";
  isLast: boolean;
}) {
  const t = useT();
  const from =
    tier.min_visits === 0
      ? t("loyalty.tiers.fromStart")
      : t("loyalty.tiers.fromVisits").replace("{count}", String(tier.min_visits));
  return (
    <li className="relative flex items-center gap-3 py-2.5">
      {/* ladder rail connecting the rung markers */}
      {!isLast && (
        <span
          aria-hidden
          className={cn(
            "absolute left-[13px] top-[34px] h-[calc(100%-24px)] w-0.5 rounded-pill",
            state === "reached" ? "bg-brand/40" : "bg-tile",
          )}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "flex h-[27px] w-[27px] flex-none items-center justify-center rounded-full text-[12px] font-extrabold",
          state === "current" && "bg-brand text-brand-fg shadow-glow",
          state === "reached" && "bg-brand-muted text-brand",
          state === "locked" && "border-[1.5px] border-dashed border-[#D8C8B0] bg-tile text-subtle",
        )}
      >
        {state === "reached" ? "✓" : "★"}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-display text-[14px] font-bold",
            state === "locked" ? "text-subtle" : "text-ink",
          )}
        >
          {tier.name}
        </span>
        <span className="block text-[12px] text-subtle">{from}</span>
      </span>
      <span
        className={cn(
          "flex-none rounded-pill px-3 py-1 text-[12.5px] font-bold",
          state === "current" ? "bg-brand text-brand-fg" : "bg-tile text-subtle",
        )}
      >
        {t("loyalty.tiers.cashbackPct").replace("{pct}", pct(tier.cashback_percent))}
      </span>
    </li>
  );
}

/**
 * Cashback status ladder for one tiered program: the customer's current status
 * pill, progress toward the next rung, and every rung with its visit threshold
 * and cashback rate. Renders nothing when the program has no ladder.
 * `embedded` drops the outer card chrome for use inside sheets.
 */
export function TierLadder({
  program,
  embedded = false,
}: {
  program: LoyaltyCardView;
  embedded?: boolean;
}) {
  const t = useT();
  if (program.tiers.length === 0) return null;
  const currentName = program.current_tier_name;
  const nextName = program.next_tier_name;
  const visitsLeft = program.next_tier_visits_left;
  const progress = segmentProgress(program);
  const reachedNext = currentName != null && !nextName;

  return (
    <section
      aria-label={t("loyalty.tiers.title")}
      className={cn(
        !embedded && "rounded-[18px] border border-line bg-card p-4 shadow-card",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-[15px] font-bold text-ink">
          {t("loyalty.tiers.title")}
        </h3>
        {currentName && (
          <span className="flex-none rounded-pill bg-brand-muted px-3 py-1 text-[11.5px] font-bold text-brand">
            {t("loyalty.tiers.yourStatus")}: {currentName}
          </span>
        )}
      </div>

      {program.joined && currentName && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-pill bg-tile">
            <div
              className="h-full rounded-pill bg-brand-gradient"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12.5px] font-semibold text-subtle">
            {reachedNext
              ? t("loyalty.tiers.topStatus")
              : t("loyalty.tiers.toNext")
                  .replace("{count}", String(visitsLeft ?? 0))
                  .replace("{name}", nextName ?? "")}
          </p>
        </div>
      )}

      <ul className="mt-2">
        {program.tiers.map((tier, i) => {
          const state =
            tier.name === currentName
              ? "current"
              : tier.min_visits <= program.visits_count
                ? "reached"
                : "locked";
          return (
            <TierRow
              key={tier.name}
              tier={tier}
              state={state}
              isLast={i === program.tiers.length - 1}
            />
          );
        })}
      </ul>
    </section>
  );
}
