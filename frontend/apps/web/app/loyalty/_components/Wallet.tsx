"use client";

import {
  usePresentVoucher,
  useRedeemPoints,
  type LoyaltyCardView,
  type LoyaltyVoucher,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  buildWallet,
  isCashback,
  programReady,
  resolveAccent,
  type WalletReward,
  type WalletShopCard,
} from "../_lib/wallet";
import { WalletDetailSheet } from "./WalletDetailSheet";

// Drag-heavy, client-only views. Dynamic-imported with ssr:false so
// framer-motion stays out of the initial server bundle (same rule as the QR
// scanner). A plain skeleton holds the box height while they load.
const skeleton = (
  <div className="mx-auto h-[240px] w-full max-w-sm animate-pulse rounded-modal bg-board" />
);
const CardStack = dynamic(() => import("./CardStack").then((m) => m.CardStack), {
  ssr: false,
  loading: () => skeleton,
});
const CardCarousel = dynamic(() => import("./CardCarousel").then((m) => m.CardCarousel), {
  ssr: false,
  loading: () => skeleton,
});

type View = "stack" | "slides";

/** Segmented control (design-system §6): white tray, accent thumb. */
function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const t = useT();
  const opts: { id: View; key: string }[] = [
    { id: "stack", key: "cmp.wallet.view.stack" },
    { id: "slides", key: "cmp.wallet.view.slides" },
  ];
  return (
    <div className="ml-auto flex w-fit gap-1 rounded-[13px] bg-card p-1.5 shadow-card" role="tablist">
      {opts.map((o) => {
        const active = view === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "rounded-[9px] px-4 py-1.5 text-[13px] font-bold transition",
              active ? "bg-brand text-brand-fg" : "text-subtle active:scale-[.98]",
            )}
          >
            {t(o.key as Parameters<typeof t>[0])}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The physical card wallet: a Stack/Slides toggle over the loyalty cards, with a
 * shared detail sheet. View choice is ephemeral UI state (not persisted). The
 * card list is grouped per shop once via `buildWallet`.
 */
export function Wallet({
  cards,
  rewards,
  openBusinessId,
}: {
  cards: LoyaltyCardView[];
  rewards: WalletReward[];
  openBusinessId?: string;
}) {
  const t = useT();
  const shops = useMemo(() => {
    const grouped = buildWallet(cards);
    const byBusiness = new Map(grouped.map((shop) => [shop.businessId, shop]));

    for (const reward of rewards) {
      const existing = byBusiness.get(reward.businessId);
      if (existing) {
        existing.rewards.push(reward);
        existing.ready = true;
        if (!existing.businessLogoUrl && reward.businessLogoUrl) {
          existing.businessLogoUrl = reward.businessLogoUrl;
        }
      } else {
        const rewardShop: WalletShopCard = {
          businessId: reward.businessId,
          businessName: reward.businessName,
          businessLogoUrl: reward.businessLogoUrl,
          programs: [],
          rewards: [reward],
          accent: resolveAccent(reward.businessId, ""),
          ready: true,
        };
        grouped.push(rewardShop);
        byBusiness.set(reward.businessId, rewardShop);
      }
    }

    for (const shop of grouped) {
      for (const program of shop.programs) {
        const alreadyMinted = shop.rewards.some(
          (reward) => reward.source === "loyalty" && reward.programId === program.program_id,
        );
        if (isCashback(program) && programReady(program) && !alreadyMinted) {
          shop.rewards.push({
            id: program.program_id,
            source: "cashback",
            businessId: program.business_id,
            businessName: program.business_name,
            businessLogoUrl: program.business_logo_url,
            title: program.reward_summary,
            subtitle: program.name,
            glyph: "💰",
            qrToken: null,
            code: null,
            programId: program.program_id,
            points: program.points_balance,
          });
          shop.ready = true;
        }
      }
    }
    return grouped;
  }, [cards, rewards]);
  const [view, setView] = useState<View>("stack");
  const [selected, setSelected] = useState<WalletShopCard | null>(null);
  const [activeReward, setActiveReward] = useState<WalletReward | null>(null);
  const redeemPoints = useRedeemPoints();
  const presentCampaign = usePresentVoucher();

  useEffect(() => {
    if (!openBusinessId) return;
    setSelected(shops.find((shop) => shop.businessId === openBusinessId) ?? null);
  }, [openBusinessId, shops]);

  const selectedBusinessId = selected?.businessId;
  useEffect(() => {
    if (!selectedBusinessId) return;
    const current = shops.find((shop) => shop.businessId === selectedBusinessId);
    if (current) setSelected(current);
  }, [selectedBusinessId, shops]);

  function closeSelected() {
    setActiveReward(null);
    setSelected(null);
  }

  function loyaltyVoucherReward(voucher: LoyaltyVoucher): WalletReward {
    return {
      id: voucher.id,
      source: "loyalty",
      businessId: voucher.business,
      businessName: voucher.business_name,
      businessLogoUrl: selected?.businessLogoUrl ?? null,
      title: voucher.reward_title,
      subtitle: voucher.program_name,
      glyph: voucher.reward_type === "cashback" ? "💰" : "🎁",
      qrToken: voucher.qr_token,
      code: voucher.voucher_code,
      programId: voucher.program,
      catalogItemName: voucher.catalog_item_name,
      cashbackAmount: voucher.cashback_amount ? Number(voucher.cashback_amount) : null,
    };
  }

  function chooseReward(reward: WalletReward) {
    if (reward.source === "cashback" && reward.programId && reward.points) {
      redeemPoints.mutate(
        { programId: reward.programId, points: reward.points },
        { onSuccess: (voucher) => setActiveReward(loyaltyVoucherReward(voucher)) },
      );
      return;
    }
    if (reward.source === "campaign") presentCampaign.mutate(reward.id);
    setActiveReward(reward);
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-subtle">
          {t("cmp.wallet.yourCards")}
        </p>
        <ViewToggle view={view} onChange={setView} />
      </div>
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 py-5">
        {view === "stack" ? (
          <>
            <CardStack cards={shops} onOpen={setSelected} />
            <p className="max-w-sm text-center text-xs font-medium leading-relaxed text-subtle">
              {t("cmp.wallet.stackHint")}
            </p>
          </>
        ) : (
          <CardCarousel cards={shops} onOpen={setSelected} />
        )}
      </div>
      <WalletDetailSheet
        card={selected}
        activeReward={activeReward}
        pendingRewardId={redeemPoints.isPending ? redeemPoints.variables?.programId ?? null : null}
        onChooseReward={chooseReward}
        onRewardChange={setActiveReward}
        onCloseReward={() => setActiveReward(null)}
        onClose={closeSelected}
      />
    </div>
  );
}
