"use client";

import { useLoyaltyProgram, useRedeemPoints } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CustomerShell } from "../../_components/CustomerShell";
import { QueryBoundary } from "../../_components/QueryBoundary";

export default function LoyaltyDetailPage() {
  const t = useT(); const { id } = useParams<{ id: string }>(); const query = useLoyaltyProgram(id); const redeem = useRedeemPoints(); const [points, setPoints] = useState(0);
  return <CustomerShell title={t("nav.loyalty")} back="/loyalty" showNav={false}><QueryBoundary query={query}>{(card) => <div>
    <div className="rounded-3xl bg-brand-gradient p-5 text-white"><p className="text-sm opacity-80">{card.business_name}</p><h1 className="mt-1 font-display text-2xl font-bold">{card.name}</h1><p className="mt-3 font-semibold">{card.reward_summary}</p></div>
    {card.type === "points" ? <div className="mt-4 rounded-2xl border border-line bg-card p-4"><p className="text-sm text-subtle">{t("cmp.loyalty.balance")}</p><p className="font-display text-3xl font-bold">{card.points_balance}</p><input aria-label={t("cmp.loyalty.redeemAmount")} type="number" min={1} max={card.points_balance} value={points || ""} onChange={(event) => setPoints(Number(event.target.value))} className="mt-3 w-full rounded-xl border border-line px-3 py-2" /><button disabled={points < 1 || redeem.isPending} onClick={() => redeem.mutate({ programId: id, points })} className="mt-3 w-full rounded-xl bg-brand py-3 font-bold text-white disabled:opacity-50">{t("cmp.loyalty.redeem")}</button></div> : <div className="mt-4 rounded-2xl border border-line bg-card p-4"><p className="font-display text-xl font-bold">{card.type === "stamp" ? card.stamps_count : card.visits_count} / {card.required_count}</p><div className="mt-3 h-2 rounded-full bg-board"><div className="h-2 rounded-full bg-brand" style={{ width: `${Math.min(100, ((card.type === "stamp" ? card.stamps_count : card.visits_count) / (card.required_count || 1)) * 100)}%` }} /></div></div>}
    <h2 className="mt-6 font-display text-lg font-bold">{t("rewards.history")}</h2><div className="mt-2 space-y-2">{card.history.map((row) => <div key={row.id} className="rounded-xl border border-line bg-card p-3 text-sm"><span className="font-semibold">{row.kind}</span><span className="float-right text-subtle">{new Date(row.created_at).toLocaleDateString()}</span></div>)}</div>
  </div>}</QueryBoundary></CustomerShell>;
}
