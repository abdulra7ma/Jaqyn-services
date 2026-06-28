"use client";

import { useBusinessLoyaltyPrograms, type LoyaltyStatus, type LoyaltyType } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { useState } from "react";
import { OwnerShell } from "../_components/OwnerShell";

export default function BusinessLoyaltyPage() {
  const t = useT(); const query = useBusinessLoyaltyPrograms(); const [type, setType] = useState<LoyaltyType | "all">("all"); const [status, setStatus] = useState<LoyaltyStatus | "all">("all");
  const rows = (query.data ?? []).filter((row) => (type === "all" || row.type === type) && (status === "all" || row.status === status));
  return <OwnerShell title={t("owner.nav.loyalty")}><div className="flex items-center justify-between"><div><h1 className="font-display text-2xl font-bold">{t("owner.nav.loyalty")}</h1></div><Link href="/business/loyalty/new" className="rounded-xl bg-brand px-4 py-3 font-bold text-white">{t("loyalty.biz.new")}</Link></div><div className="mt-5 flex flex-wrap gap-2"><select aria-label="type" value={type} onChange={(event) => setType(event.target.value as LoyaltyType | "all")} className="rounded-xl border border-line bg-card px-3 py-2"><option value="all">{t("loyalty.biz.all")}</option><option value="points">{t("loyalty.biz.points")}</option><option value="stamp">{t("loyalty.biz.stamp")}</option><option value="visit">{t("loyalty.biz.visit")}</option></select><select aria-label="status" value={status} onChange={(event) => setStatus(event.target.value as LoyaltyStatus | "all")} className="rounded-xl border border-line bg-card px-3 py-2"><option value="all">{t("loyalty.biz.all")}</option><option value="active">active</option><option value="paused">paused</option><option value="archived">archived</option></select></div><div className="mt-5 grid gap-4 xl:grid-cols-2">{rows.map((row) => <Link key={row.id} href={`/business/loyalty/${row.id}`} className="rounded-2xl border border-line bg-card p-5 shadow-card"><div className="flex justify-between"><h2 className="font-display text-lg font-bold">{row.name}</h2><span className="rounded-full bg-board px-2.5 py-1 text-xs font-bold">{row.type}</span></div><p className="mt-2 text-sm text-subtle">{row.reward_summary}</p><div className="mt-4 grid grid-cols-3 gap-2 text-center"><Stat label={t("loyalty.biz.members")} value={row.members ?? 0} /><Stat label={t("loyalty.biz.outstanding")} value={row.outstanding ?? 0} /><Stat label={t("loyalty.biz.redeemed")} value={row.redeemed ?? 0} /></div></Link>)}</div></OwnerShell>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-board p-2"><p className="font-display text-xl font-bold">{value}</p><p className="text-[11px] text-subtle">{label}</p></div>; }
