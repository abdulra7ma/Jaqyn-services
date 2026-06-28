"use client";

// Rewards = the customer's loyalty wallet (campaigns-restructure design §6a,
// refined): an "In progress" row of cards still being collected (in-progress
// campaigns, from the feed's `followed`) above the earned vouchers, grouped
// Active / Used / Expired. The same in-progress cards also appear on the
// /campaigns feed ("From places you go"); surfacing them here too makes the
// Rewards tab read as a full loyalty wallet (cards + earned rewards).

import {
  useCampaignFeed,
  useCampaignWallet,
  type Campaign,
  type CampaignWallet,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import {
  BusinessLoyaltyCard,
  VoucherCard,
  VoucherRow,
  type LoyaltyProgramView,
} from "../_components/campaigns";
import { PageTitle } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";

function isWalletEmpty(w: CampaignWallet): boolean {
  return w.active.length === 0 && w.used.length === 0 && w.expired.length === 0;
}

// One BusinessLoyaltyCard per business: the business header + its programs.
type BusinessGroup = {
  business: { id: string; name: string; logo_url: string | null };
  programs: LoyaltyProgramView[];
};

/** Flatten an in-progress Campaign into a switcher program view. */
function toProgramView(c: Campaign): LoyaltyProgramView {
  const p = c.my_progress;
  return {
    campaignId: c.id,
    name: c.name,
    mechanic: c.rule.mechanic,
    rewardSummary: c.reward.title,
    joined: p?.joined ?? true,
    progressCount: p?.current_count ?? 0,
    target: p?.target_count ?? c.rule.required_count ?? 0,
    pointsBalance: p?.points_balance ?? 0,
    cashbackPerPoint: c.rule.cashback_per_point ?? null,
  };
}

/**
 * Group the in-progress feed by business so the "In progress" row shows ONE card
 * per business (its programs behind a switcher). First-seen order is preserved so
 * the row stays stable across refetches.
 */
function groupByBusiness(campaigns: Campaign[]): BusinessGroup[] {
  const groups = new Map<string, BusinessGroup>();
  for (const c of campaigns) {
    const existing = groups.get(c.business.id);
    if (existing) {
      existing.programs.push(toProgramView(c));
    } else {
      groups.set(c.business.id, {
        business: { id: c.business.id, name: c.business.name, logo_url: c.business.logo_url },
        programs: [toProgramView(c)],
      });
    }
  }
  return [...groups.values()];
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
            // Loyalty cards = individual programs only (points/stamp/visit/spend).
            // Group/social in-progress live elsewhere (the active-group banner +
            // the campaigns feed), not in the loyalty wallet.
            const inProgress = (feed.data?.followed ?? []).filter(
              (c) => c.campaign_type === "individual",
            );
            const businessGroups = groupByBusiness(inProgress);
            const empty = isWalletEmpty(w) && inProgress.length === 0 && !feed.isLoading;

            return (
              <>
                <PageTitle>{t("cmp.wallet.title")}</PageTitle>
                <p className="mt-1 text-[13.5px] text-subtle">{t("cmp.wallet.subtitle")}</p>

                {empty && <p className="mt-8 text-sm text-subtle">{t("cmp.wallet.empty")}</p>}

                {businessGroups.length > 0 && (
                  <section>
                    <SectionLabel>{t("cmp.wallet.loyaltyTitle")}</SectionLabel>
                    <p className="mt-1 text-[12.5px] text-subtle">
                      {t("cmp.wallet.loyaltySubtitle")}
                    </p>
                    <div className="mt-3 flex flex-col gap-3">
                      {businessGroups.map((g) => (
                        <BusinessLoyaltyCard
                          key={g.business.id}
                          business={g.business}
                          programs={g.programs}
                        />
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
