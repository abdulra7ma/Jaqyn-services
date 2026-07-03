"use client";

import {
  useCampaignWallet,
  useLoyaltyCards,
  useLoyaltyVouchers,
  type CampaignVoucher,
  type LoyaltyVoucher,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useSearchParams } from "next/navigation";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { PageTitle } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";
import type { WalletReward } from "./_lib/wallet";
import { Wallet } from "./_components/Wallet";

function campaignReward(voucher: CampaignVoucher): WalletReward {
  return {
    id: voucher.id,
    source: "campaign",
    businessId: voucher.business.id,
    businessName: voucher.business.name,
    businessLogoUrl: null,
    title: voucher.reward_title,
    subtitle: voucher.campaign.name,
    glyph: voucher.glyph,
    qrToken: voucher.qr_token,
    code: voucher.code,
    campaignId: voucher.campaign.id,
    itemSelection: voucher.item_selection,
    catalogItemName: voucher.catalog_item?.name ?? null,
  };
}

function loyaltyReward(voucher: LoyaltyVoucher): WalletReward {
  return {
    id: voucher.id,
    source: "loyalty",
    businessId: voucher.business,
    businessName: voucher.business_name,
    businessLogoUrl: null,
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

export default function LoyaltyPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  const cards = useLoyaltyCards();
  const campaignWallet = useCampaignWallet();
  const loyaltyWallet = useLoyaltyVouchers();
  const searchParams = useSearchParams();
  const openBusinessId = searchParams.get("business") ?? undefined;
  const rewards = [
    ...(campaignWallet.data?.active ?? []).map(campaignReward),
    ...(loyaltyWallet.data?.active ?? []).map(loyaltyReward),
  ];
  return (
    <CustomerShell title={t("nav.loyalty")} hideChromeTitle>
      {!isAuthenticated ? null : (
        <QueryBoundary query={cards}>
          {(rows) => (
            <>
              <div>
                <PageTitle>{t("cmp.wallet.loyaltyTitle")}</PageTitle>
                <p className="mt-1 text-[13.5px] text-subtle">
                  {t("cmp.wallet.loyaltySubtitle")}
                </p>
              </div>
              {rows.length === 0 && rewards.length === 0 ? (
                <p className="mt-8 text-sm text-subtle">{t("loyalty.empty")}</p>
              ) : (
                <Wallet
                  cards={rows}
                  rewards={rewards}
                  openBusinessId={openBusinessId}
                />
              )}
            </>
          )}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}
