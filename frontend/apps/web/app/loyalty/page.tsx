"use client";

import { useLoyaltyCards, type LoyaltyCardView } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { BusinessLoyaltyCard, type LoyaltyProgramView } from "../_components/campaigns";
import { GiftIcon } from "../_components/icons";
import { PageTitle } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";

type Group = { business: { id: string; name: string; logo_url: string | null }; programs: LoyaltyProgramView[] };

function groups(cards: LoyaltyCardView[]): Group[] {
  const result = new Map<string, Group>();
  for (const card of cards) {
    const program: LoyaltyProgramView = {
      campaignId: card.program_id, name: card.name, mechanic: card.type,
      rewardSummary: card.reward_summary, joined: card.joined,
      progressCount: card.type === "stamp" ? card.stamps_count : card.visits_count,
      target: card.required_count ?? 0, pointsBalance: card.points_balance,
      cashbackPerPoint: card.cashback_per_point,
    };
    const current = result.get(card.business_id);
    if (current) current.programs.push(program);
    else result.set(card.business_id, { business: { id: card.business_id, name: card.business_name, logo_url: card.business_logo_url }, programs: [program] });
  }
  return [...result.values()];
}

export default function LoyaltyPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  const cards = useLoyaltyCards();
  return <CustomerShell title={t("nav.loyalty")} hideChromeTitle>
    {!isAuthenticated ? null : <QueryBoundary query={cards}>{(rows) => <>
      <div className="flex items-start justify-between gap-3">
        <div><PageTitle>{t("cmp.wallet.loyaltyTitle")}</PageTitle><p className="mt-1 text-[13.5px] text-subtle">{t("cmp.wallet.loyaltySubtitle")}</p></div>
        <Link href="/rewards" aria-label={t("nav.rewards")} className="rounded-xl border border-line bg-card p-2.5 text-brand"><GiftIcon className="h-5 w-5" /></Link>
      </div>
      {rows.length === 0 ? <p className="mt-8 text-sm text-subtle">{t("loyalty.empty")}</p> : <div className="mt-5 flex flex-col gap-3">{groups(rows).map((group) => <BusinessLoyaltyCard key={group.business.id} business={group.business} programs={group.programs} />)}</div>}
    </>}</QueryBoundary>}
  </CustomerShell>;
}
