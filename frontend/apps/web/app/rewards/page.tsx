"use client";

import { useCampaignWallet, useLoyaltyVouchers, type CampaignVoucher, type LoyaltyVoucher } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { CustomerShell } from "../_components/CustomerShell";
import { VoucherCard, VoucherRow } from "../_components/campaigns";
import { PageTitle } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";

type WalletVoucher = CampaignVoucher & { cashback_amount?: string | null };

function loyaltyVoucher(voucher: LoyaltyVoucher): WalletVoucher {
  const expiry = voucher.expires_at ? new Date(voucher.expires_at) : null;
  return {
    id: voucher.id, code: voucher.voucher_code, status: voucher.status, glyph: "🎁",
    business: { id: voucher.business, name: voucher.business_name },
    campaign: { id: voucher.program, name: voucher.program_name }, reward_title: voucher.reward_title,
    reward_description: "", qr_token: voucher.qr_token ?? voucher.voucher_code,
    issued_label: new Date(voucher.issued_at).toLocaleDateString(), expires_label: expiry?.toLocaleDateString() ?? "",
    expiring_soon: expiry ? expiry.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000 : false,
    redeemed_at_label: voucher.redeemed_at ? new Date(voucher.redeemed_at).toLocaleDateString() : null,
    redeemed_by: null, redeemed_branch: null, cashback_amount: voucher.cashback_amount,
    catalog_item: voucher.catalog_item ? { id: voucher.catalog_item, name: voucher.catalog_item_name ?? "", price: "", image: null } : null,
    item_selection: null, domain: "loyalty",
  };
}

function Section({ title, rows, active = false }: { title: string; rows: WalletVoucher[]; active?: boolean }) {
  if (rows.length === 0) return null;
  return <section><h2 className="mt-6 text-xs font-bold uppercase tracking-wide text-subtle">{title}</h2><div className="mt-3 flex flex-col gap-3">{rows.map((voucher) => active ? <VoucherCard key={`${voucher.domain ?? "campaign"}-${voucher.id}`} voucher={voucher} /> : <VoucherRow key={`${voucher.domain ?? "campaign"}-${voucher.id}`} voucher={voucher} />)}</div></section>;
}

export default function RewardsPage() {
  const t = useT(); const { isAuthenticated } = useRequireAuth(); const campaigns = useCampaignWallet({ refetchInterval: 4000 }); const loyalty = useLoyaltyVouchers();
  if (!isAuthenticated) return null;
  const active = [...(campaigns.data?.active ?? []), ...(loyalty.data?.active ?? []).map(loyaltyVoucher)].sort((a, b) => a.expires_label.localeCompare(b.expires_label));
  const used = [...(campaigns.data?.used ?? []), ...(loyalty.data?.used ?? []).map(loyaltyVoucher)];
  const expired = [...(campaigns.data?.expired ?? []), ...(loyalty.data?.expired ?? []).map(loyaltyVoucher)];
  return <CustomerShell title={t("nav.rewards")} hideChromeTitle><PageTitle>{t("nav.rewards")}</PageTitle><p className="mt-1 text-[13.5px] text-subtle">{t("rewards.subtitle")}</p>{campaigns.isLoading || loyalty.isLoading ? <div className="mt-8 h-24 animate-pulse rounded-2xl bg-board" /> : active.length + used.length + expired.length === 0 ? <p className="mt-8 text-sm text-subtle">{t("cmp.wallet.empty")}</p> : <><Section title={t("cmp.wallet.active")} rows={active} active /><Section title={t("cmp.wallet.used")} rows={used} /><Section title={t("cmp.wallet.expired")} rows={expired} /></>}</CustomerShell>;
}
