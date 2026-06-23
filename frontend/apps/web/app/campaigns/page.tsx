"use client";

import { useCampaigns } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { CampaignCard } from "../_components/campaigns";
import { GiftIcon, ScanIcon } from "../_components/icons";
import { PageTitle } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";

// In-page entries to the rest of the Campaigns tab. The tab has no sub-nav of its
// own (it lives under the main customer bottom nav), so the voucher wallet and the
// visit-QR are reached from here. The group session is reached from a campaign
// detail (campaigns/[id] → /campaigns/[id]/group), so it is not surfaced here.
function CampaignTabEntries() {
  const t = useT();
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <Link
        href="/campaign-wallet"
        className="flex items-center gap-2.5 rounded-2xl border border-line bg-card p-3.5 shadow-card transition active:scale-[.99]"
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-muted text-brand">
          <GiftIcon className="h-5 w-5" />
        </span>
        <span className="text-sm font-bold text-ink">{t("cmp.nav.wallet")}</span>
      </Link>
      <Link
        href="/campaigns/visit-qr"
        className="flex items-center gap-2.5 rounded-2xl border border-line bg-card p-3.5 shadow-card transition active:scale-[.99]"
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-muted text-brand">
          <ScanIcon className="h-5 w-5" />
        </span>
        <span className="text-sm font-bold text-ink">{t("cmp.visitQr.title")}</span>
      </Link>
    </div>
  );
}

export default function CampaignsDiscoverPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  const campaigns = useCampaigns();

  return (
    <CustomerShell title={t("campaigns.title")} hideChromeTitle>
      {!isAuthenticated ? null : (
        <>
          <PageTitle>{t("cmp.discover.title")}</PageTitle>
          <p className="mt-1 text-[13.5px] text-subtle">{t("cmp.discover.subtitle")}</p>
          <CampaignTabEntries />
          <QueryBoundary
            query={campaigns}
            isEmpty={(list) => list.length === 0}
            emptyMessage={t("cmp.discover.empty")}
          >
            {(list) => (
              <div className="mt-5 flex flex-col gap-3.5">
                {list.map((c) => (
                  <CampaignCard key={c.id} campaign={c} />
                ))}
              </div>
            )}
          </QueryBoundary>
        </>
      )}
    </CustomerShell>
  );
}
