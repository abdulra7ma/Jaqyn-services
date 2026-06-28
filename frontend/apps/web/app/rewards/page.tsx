"use client";

// Rewards = the customer's loyalty wallet (campaigns-restructure design §6a,
// refined): an "In progress" row of cards still being collected (in-progress
// campaigns, from the feed's `followed`) above the earned vouchers, grouped
// Active / Used / Expired. The same in-progress cards also appear on the
// /campaigns feed ("From places you go"); surfacing them here too makes the
// Rewards tab read as a full loyalty wallet (cards + earned rewards).

import { useCampaignFeed, useCampaignWallet, type CampaignWallet } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { CampaignCarouselCard, VoucherCard, VoucherRow } from "../_components/campaigns";
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
  // In-progress cards (loyalty/individual being collected) come from the feed's
  // `followed` list — the same source as the /campaigns "From places you go" row.
  const feed = useCampaignFeed("all");

  return (
    <CustomerShell title={t("cmp.wallet.title")} hideChromeTitle>
      {!isAuthenticated ? null : (
        <QueryBoundary query={wallet}>
          {(w) => {
            const inProgress = feed.data?.followed ?? [];
            const empty = isWalletEmpty(w) && inProgress.length === 0 && !feed.isLoading;

            return (
              <>
                <PageTitle>{t("cmp.wallet.title")}</PageTitle>
                <p className="mt-1 text-[13.5px] text-subtle">{t("cmp.wallet.subtitle")}</p>

                {empty && <p className="mt-8 text-sm text-subtle">{t("cmp.wallet.empty")}</p>}

                {inProgress.length > 0 && (
                  <section>
                    <SectionLabel>{t("cmp.wallet.inProgress")}</SectionLabel>
                    <div className="-mx-5 mt-3 flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {inProgress.map((c) => (
                        <div key={c.id} className="snap-start">
                          <CampaignCarouselCard campaign={c} />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

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
            );
          }}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}
