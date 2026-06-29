"use client";

import { useLoyaltyCards } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { GiftIcon } from "../_components/icons";
import { PageTitle } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";
import { Wallet } from "./_components/Wallet";

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
      {rows.length === 0 ? <p className="mt-8 text-sm text-subtle">{t("loyalty.empty")}</p> : <Wallet cards={rows} />}
    </>}</QueryBoundary>}
  </CustomerShell>;
}
