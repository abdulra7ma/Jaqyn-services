import type { CampaignVoucher, LoyaltyCardView } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Sheet, cn } from "@jaqyn/ui";
import { GlyphTile, VoucherItemSheet, VoucherQrBlock } from "../../_components/campaigns";
import { ScanIcon } from "../../_components/icons";
import { useQrSheet } from "../../_components/QrSheet";
import type { WalletReward, WalletShopCard } from "../_lib/wallet";
import { ACCENT_BG, isCashback } from "../_lib/wallet";
import { TierLadder } from "./TierLadder";

type Translate = ReturnType<typeof useT>;

/** Emoji glyph per program type, shown on each program row. */
const TYPE_GLYPH: Record<LoyaltyCardView["type"], string> = {
  points: "💰",
  stamp: "🎟️",
  visit: "📍",
};

/** Type → pill label key (reuses the existing loyalty pill copy). */
const TYPE_PILL: Record<LoyaltyCardView["type"], string> = {
  points: "cmp.loyalty.pill.cashback",
  stamp: "cmp.loyalty.pill.stamp",
  visit: "cmp.loyalty.pill.visits",
};

/** Cashback balance in som (display only; backend is authoritative). */
function somValue(p: LoyaltyCardView): number {
  return p.cashback_per_point
    ? Math.round(Number(p.cashback_per_point) * p.points_balance)
    : p.points_balance;
}

/** A representative open–close range from the business hours map, or null when
 * none is set. Picks the first day present — most shops keep one daily range. */
function formatHours(hours: Record<string, [string, string]>): string | null {
  const first = Object.values(hours)[0];
  return first ? `${first[0]} – ${first[1]}` : null;
}

/** Category slug → localized label, falling back to the raw slug. */
function categoryLabel(t: Translate, category: string): string {
  if (!category) return "";
  const label = t(`cmp.wallet.cat.${category}` as Parameters<Translate>[0]);
  return label.startsWith("cmp.wallet.cat.") ? category : label;
}

/** One program inside the detail sheet: glyph + title/type + balance, then a
 * type-specific summary line (cashback som, or stamp/visit progress). */
function ProgramRow({ program }: { program: LoyaltyCardView }) {
  const t = useT();
  const cash = isCashback(program);
  const count = program.type === "stamp" ? program.stamps_count : program.visits_count;
  const total = program.required_count ?? 0;
  const som = somValue(program);
  const pill = cash
    ? `${som} ${t("cmp.wallet.som")}`
    : program.type === "points"
      ? String(program.points_balance)
      : `${count}/${total}`;

  return (
    <div className="py-3.5">
      <div className="flex items-center gap-3">
        <GlyphTile glyph={TYPE_GLYPH[program.type]} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold text-ink">
            {program.reward_summary}
          </p>
          <p className="text-[12.5px] font-semibold text-subtle">
            {t(TYPE_PILL[program.type] as Parameters<Translate>[0])}
          </p>
        </div>
        <span className="flex-none rounded-pill bg-brand-muted px-3 py-1 text-[12.5px] font-bold text-brand">
          {pill}
        </span>
      </div>

      {cash ? (
        <>
          <p className="mt-2.5 font-display text-[26px] font-extrabold leading-none text-brand">
            {som}{" "}
            <span className="font-sans text-[13px] font-bold text-amber-deep">
              {t("cmp.loyalty.somCashback")}
            </span>
          </p>
          {program.tiers.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <TierLadder program={program} embedded />
            </div>
          )}
        </>
      ) : total > 0 ? (
        <div className="mt-2.5">
          <div className="h-2 overflow-hidden rounded-pill bg-board">
            <div
              className="h-full rounded-pill bg-brand"
              style={{ width: `${Math.min(100, Math.round((count / total) * 100))}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12.5px] font-semibold text-subtle">
            {count} / {total}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Label / value row in the info card. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <span className="text-[13.5px] font-semibold text-subtle">{label}</span>
      <span className="text-[13.5px] font-bold text-ink">{value}</span>
    </div>
  );
}

/**
 * Detail sheet for one shop's wallet card (matches the standalone demo): a
 * header (logo + name + category·area), an accent featured band naming the
 * program count, a row per program (handles a business running several loyalty
 * types), an info card (expires / location / hours), and a "Show my QR" action
 * that opens the customer's personal QR via the shared sheet. Closed when
 * `card` is null.
 */
export function WalletDetailSheet({
  card,
  activeReward,
  pendingRewardId,
  onChooseReward,
  onRewardChange,
  onCloseReward,
  onClose,
}: {
  card: WalletShopCard | null;
  activeReward: WalletReward | null;
  pendingRewardId: string | null;
  onChooseReward: (reward: WalletReward) => void;
  onRewardChange: (reward: WalletReward) => void;
  onCloseReward: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const { openQr } = useQrSheet();
  const head = card?.programs[0];
  const cash = head ? isCashback(head) : false;
  const area = head?.business_area ?? "";
  const hours = head ? formatHours(head.business_hours) : null;
  const subtitle = head
    ? [categoryLabel(t, head.business_category), area].filter(Boolean).join(" · ")
    : "";
  const count = card?.programs.length ?? 0;
  const countLabel =
    count === 1
      ? t("cmp.wallet.detail.oneProgram")
      : t("cmp.wallet.programs").replace("{count}", String(count));

  return (
    <Sheet
      open={card != null}
      onOpenChange={(open) => {
        if (!open && card != null) onClose();
      }}
      ariaLabel={card?.businessName ?? t("nav.loyalty")}
      surface="cream"
    >
      {card && (
        <div className="flex flex-col gap-4 pb-2">
          {/* header */}
          <div className="flex items-center gap-3">
            <GlyphTile glyph="🏷️" size={52} image={card.businessLogoUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[20px] font-bold text-ink">
                {card.businessName}
              </p>
              {subtitle && <p className="truncate text-[13px] text-subtle">{subtitle}</p>}
            </div>
          </div>

          {/* featured band + program rows */}
          <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
            <div className={cn("flex items-center gap-3 p-4 text-white", ACCENT_BG[card.accent])}>
              <GlyphTile glyph="🏷️" size={40} image={card.businessLogoUrl} />
              <div className="min-w-0">
                <p className="truncate font-display text-[16px] font-bold">{card.businessName}</p>
                <p className="text-[12.5px] font-semibold text-white/85">
                  {count > 0
                    ? `${t("cmp.wallet.detail.loyalty")} · ${countLabel}`
                    : t("cmp.wallet.rewardsReady").replace(
                        "{count}",
                        String(card.rewards.length),
                      )}
                </p>
              </div>
            </div>
            {card.programs.length > 0 && (
              <div className="divide-y divide-line px-4">
                {card.programs.map((p) => (
                  <ProgramRow key={p.program_id} program={p} />
                ))}
              </div>
            )}
          </div>

          {card.rewards.length > 0 && (
            <section aria-labelledby="wallet-ready-rewards">
              <h3 id="wallet-ready-rewards" className="font-display text-[17px] font-bold text-ink">
                {t("cmp.wallet.readyRewards")}
              </h3>
              <p className="mt-1 text-[13px] text-subtle">{t("cmp.wallet.chooseRewardHint")}</p>
              <div className="mt-3 flex flex-col gap-2">
                {card.rewards.map((reward) => (
                  <button
                    key={`${reward.source}-${reward.id}`}
                    type="button"
                    onClick={() => onChooseReward(reward)}
                    disabled={pendingRewardId === reward.id}
                    className="flex min-h-16 items-center gap-3 rounded-xl border border-line bg-card p-3 text-left shadow-card transition active:scale-[.99] disabled:opacity-60"
                  >
                    <GlyphTile glyph={reward.glyph} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{reward.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-subtle">
                        {reward.cashbackAmount
                          ? `${reward.cashbackAmount} ${t("cmp.wallet.som")} · ${reward.subtitle}`
                          : reward.subtitle}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-xs font-bold text-brand">
                      <ScanIcon className="h-4 w-4" />
                      {t(pendingRewardId === reward.id ? "common.loading" : "cmp.wallet.useReward")}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* info card */}
          {head && (
            <div className="divide-y divide-line rounded-2xl border border-line bg-card px-4 shadow-card">
              <InfoRow
                label={t("cmp.wallet.detail.expires")}
                value={
                  cash
                    ? t("cmp.wallet.detail.noExpiry")
                    : t("cmp.wallet.detail.expiryDays").replace(
                        "{count}",
                        String(head.reward_expiry_days),
                      )
                }
              />
              <InfoRow label={t("cmp.wallet.detail.location")} value={area || "—"} />
              <InfoRow label={t("cmp.wallet.detail.hours")} value={hours ?? "—"} />
            </div>
          )}

          {head && (
            <button
              type="button"
              onClick={() => {
                onClose();
                openQr();
              }}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-line bg-card px-6 py-3.5 font-sans text-[15px] font-bold text-ink shadow-card transition active:scale-[.98]"
            >
              <ScanIcon className="h-5 w-5" />
              {t("cmp.wallet.earnMore")}
            </button>
          )}
        </div>
      )}

      <Sheet
        open={activeReward != null}
        onOpenChange={(open) => {
          if (!open) onCloseReward();
        }}
        ariaLabel={activeReward?.title ?? t("cmp.wallet.readyRewards")}
        variant="modal"
        nested
      >
        {activeReward &&
        activeReward.source === "campaign" &&
        activeReward.itemSelection === "customer" &&
        !activeReward.catalogItemName &&
        activeReward.campaignId ? (
          <VoucherItemSheet
            campaignId={activeReward.campaignId}
            voucherId={activeReward.id}
            onSelected={(voucher: CampaignVoucher) =>
              onRewardChange({
                ...activeReward,
                qrToken: voucher.qr_token,
                code: voucher.code,
                catalogItemName: voucher.catalog_item?.name ?? null,
              })
            }
          />
        ) : activeReward?.qrToken && activeReward.code ? (
          <div className="pb-3 pt-1">
            <VoucherQrBlock
              glyph={activeReward.glyph}
              rewardTitle={activeReward.title}
              businessName={activeReward.businessName}
              qrToken={activeReward.qrToken}
              code={activeReward.code}
            />
            <p className="mx-auto mt-3 max-w-[280px] text-center text-sm text-subtle">
              {t("cmp.voucher.showStaff")}
            </p>
          </div>
        ) : activeReward ? (
          <p className="py-8 text-center text-sm text-subtle">{t("cmp.wallet.qrUnavailable")}</p>
        ) : null}
      </Sheet>
    </Sheet>
  );
}
