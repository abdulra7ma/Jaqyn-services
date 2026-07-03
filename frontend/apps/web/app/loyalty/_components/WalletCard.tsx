import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import type { WalletShopCard } from "../_lib/wallet";
import { ACCENT_BG, isCashback, progViz } from "../_lib/wallet";

/** Compact progress visual on the card face. White-on-accent, design-system §9.
 * Big numbers use the display font (Bricolage); the `som` unit uses the UI font
 * (Hanken). */
function FaceProgress({ card }: { card: WalletShopCard }) {
  const t = useT();
  const readyCashback = card.rewards.find(
    (reward) => reward.cashbackAmount != null && reward.cashbackAmount > 0,
  );
  if (readyCashback?.cashbackAmount) {
    return (
      <p className="font-display text-[32px] font-extrabold leading-none text-white">
        {readyCashback.cashbackAmount}{" "}
        <span className="font-sans text-[13px] font-bold">{t("cmp.wallet.som")}</span>
      </p>
    );
  }
  // The face summarises the shop's headline program (first one); the detail
  // sheet breaks out every program.
  const head = card.programs[0];
  if (!head) {
    return (
      <p className="font-display text-[22px] font-extrabold text-white">
        {t("cmp.wallet.rewardsReady").replace("{count}", String(card.rewards.length))}
      </p>
    );
  }
  const viz = progViz(head);
  if (viz.kind === "number") {
    return (
      <p className="flex items-baseline gap-1.5 leading-none text-white">
        <span className="font-display text-[34px] font-extrabold">{viz.value}</span>
        <span className="font-sans text-[15px] font-bold text-white/80">{t("cmp.wallet.som")}</span>
      </p>
    );
  }
  // Count label, e.g. "3 of 6 stamps" / "3 of 6 visits" — gives stamp/visit
  // cards the same legible weight the cashback number gives points cards.
  const count = head.type === "stamp" ? head.stamps_count : head.visits_count;
  const total = head.required_count ?? 0;
  const label = t(head.type === "stamp" ? "cmp.loyalty.stamps" : "cmp.loyalty.visitsCount")
    .replace("{count}", String(total > 0 ? Math.min(count, total) : count))
    .replace("{total}", String(total));

  if (viz.kind === "dots") {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
          {Array.from({ length: viz.total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                i < viz.filled ? "bg-white" : "bg-white/25",
              )}
            />
          ))}
        </div>
        <p className="mt-2.5 text-[14px] font-bold text-white">{label}</p>
      </div>
    );
  }
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-pill bg-white/25" aria-hidden>
        <div className="h-full rounded-pill bg-white" style={{ width: `${viz.pct}%` }} />
      </div>
      <p className="mt-2 text-[14px] font-bold text-white">{label}</p>
    </div>
  );
}

/**
 * The physical loyalty card face (design-system §8 "Featured card"): accent
 * gradient, frosted glyph + initials, decorative watermark bleed, shop name,
 * headline reward + progress, and — when claimable — a pulsing 🎁 Ready badge.
 * Pure presentation; gestures and stacking live in `CardStack` / `CardCarousel`.
 */
export function WalletCard({ card }: { card: WalletShopCard }) {
  const t = useT();
  const head = card.programs[0];
  const headlineReward = head?.reward_summary ?? card.rewards[0]?.title ?? "";
  const multi = card.programs.length + card.rewards.length > 1;
  const cashback = head ? isCashback(head) : false;
  const initials = card.businessName.trim().slice(0, 2).toUpperCase();
  const itemCount = card.programs.length + card.rewards.length;
  const statusLabel = card.ready
    ? t("cmp.wallet.ready")
    : multi
      ? t("cmp.wallet.programs").replace("{count}", String(itemCount))
      : head
        ? t(`cmp.wallet.cardType.${head.type}` as Parameters<typeof t>[0])
        : t("cmp.wallet.ready");
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden rounded-modal border border-white/30 p-4 text-white shadow-modal",
        ACCENT_BG[card.accent],
        card.ready && "ring-2 ring-white/80 shadow-sage",
      )}
    >
      {/* decorative translucent watermark circle bleed (§8) */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/10"
      />
      {/* oversized faded initial — echoes the demo's product illustration */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-7 right-3 select-none font-display text-[128px] font-extrabold leading-none text-white/10"
      >
        {initials.slice(0, 1)}
      </span>

      <div className="relative flex items-start gap-3">
        {/* frosted glyph: logo if present, else initials */}
        {card.businessLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small avatar, remote logo, no layout shift risk
          <img
            src={card.businessLogoUrl}
            alt=""
            className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/40"
          />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 font-display text-[16px] font-bold ring-1 ring-white/40 backdrop-blur-sm">
            {initials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[19px] font-bold leading-tight drop-shadow-sm">
            {card.businessName}
          </p>
          <p className="mt-0.5 truncate text-[13.5px] font-semibold text-white/85">
            {headlineReward}
          </p>
        </div>
        <span
          className={cn(
            "flex-none rounded-pill px-2.5 py-1 text-[11.5px] font-bold backdrop-blur-sm",
            card.ready ? "animate-pulse bg-sage-soft text-sage" : "bg-white/20 text-white/85",
          )}
        >
          {card.ready && <span aria-hidden>✓ </span>}
          {statusLabel}
        </span>
      </div>

      <div className="relative mt-auto">
        <FaceProgress card={card} />
        <div className="mt-3 flex items-center justify-between gap-2">
          {card.ready ? (
            <p className="text-[13.5px] font-bold text-white">
              🎁 {t(card.rewards.length > 0 ? "cmp.wallet.chooseReward" : cashback ? "cmp.wallet.cashbackReady" : "cmp.wallet.readyToUse")}
            </p>
          ) : (
            <span />
          )}
          {card.ready ? (
            <span className="rounded-pill border border-white/30 bg-white/15 px-3 py-1.5 text-[11.5px] font-bold text-white backdrop-blur-sm">
              {t("cmp.wallet.showMyQr")}
            </span>
          ) : multi ? (
            <p className="text-[12px] font-bold uppercase tracking-[0.04em] text-white/70">
              {t("cmp.wallet.items").replace("{count}", String(itemCount))}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
