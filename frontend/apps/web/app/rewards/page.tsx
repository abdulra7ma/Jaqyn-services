"use client";

// Rewards = earned vouchers (campaigns-restructure design §6a Change 3). The
// Rewards tab is the single campaign wallet: vouchers unlocked by completing
// campaigns, grouped Active / Used / Expired. Campaigns (things to join) live on
// the /campaigns feed — the two are kept distinct.

import { useCampaignWallet, type CampaignWallet } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { VoucherCard, VoucherRow } from "../_components/campaigns";
import { PageTitle } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";

function isWalletEmpty(w: CampaignWallet): boolean {
  return w.active.length === 0 && w.used.length === 0 && w.expired.length === 0;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="mt-6 text-xs font-bold uppercase tracking-[0.05em] text-subtle">{children}</h2>
  );
}

export default function RewardsPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  // Poll so a staff redemption flips a voucher from Active → Used live.
  const wallet = useCampaignWallet({ refetchInterval: 4000 });

  return (
    <CustomerShell title={t("cmp.wallet.title")} hideChromeTitle>
      {!isAuthenticated ? null : (
        <QueryBoundary query={wallet} isEmpty={isWalletEmpty} emptyMessage={t("cmp.wallet.empty")}>
          {(w) => (
            <>
              <PageTitle>{t("cmp.wallet.title")}</PageTitle>
              <p className="mt-1 text-[13.5px] text-subtle">{t("cmp.wallet.subtitle")}</p>

              {w.active.length > 0 && (
                <>
                  <SectionLabel>{t("cmp.wallet.active")}</SectionLabel>
                  <div className="mt-3 flex flex-col gap-3">
                    {w.active.map((v) => (
                      <VoucherCard key={v.id} voucher={v} />
                    ))}
                  </div>
                </>
              )}

              {w.used.length > 0 && (
                <>
                  <SectionLabel>{t("cmp.wallet.used")}</SectionLabel>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {w.used.map((v) => (
                      <VoucherRow key={v.id} voucher={v} />
                    ))}
                  </div>
                </>
              )}

              {w.expired.length > 0 && (
                <>
                  <SectionLabel>{t("cmp.wallet.expired")}</SectionLabel>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {w.expired.map((v) => (
                      <VoucherRow key={v.id} voucher={v} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}
