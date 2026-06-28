"use client";

import { useActivateLoyaltyProgram, useArchiveLoyaltyProgram, useLoyaltyProgramDetail, usePauseLoyaltyProgram } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useParams } from "next/navigation";
import { useState } from "react";
import { OwnerShell } from "../../_components/OwnerShell";

const TABS = ["overview", "members", "transactions", "reward_usage", "analytics", "settings"] as const;

export default function LoyaltyProgramDetailPage() {
  const t = useT(); const { id } = useParams<{ id: string }>(); const query = useLoyaltyProgramDetail(id); const pause = usePauseLoyaltyProgram(); const activate = useActivateLoyaltyProgram(); const archive = useArchiveLoyaltyProgram(); const [tab, setTab] = useState<(typeof TABS)[number]>("overview"); const program = query.data;
  return <OwnerShell title={program?.name ?? t("owner.nav.loyalty")}><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-2xl font-bold">{program?.name}</h1><p className="text-sm text-subtle">{program?.status} · {program?.type}</p></div><div className="flex gap-2">{program?.status === "active" ? <button onClick={() => pause.mutate(id)} className="rounded-xl border border-line px-3 py-2">{t("loyalty.biz.pause")}</button> : <button onClick={() => activate.mutate(id)} className="rounded-xl bg-brand px-3 py-2 text-white">{t("loyalty.biz.activate")}</button>}<button onClick={() => archive.mutate(id)} className="rounded-xl border border-danger px-3 py-2 text-danger">{t("loyalty.biz.archive")}</button></div></div><div role="tablist" className="mt-6 flex gap-2 overflow-x-auto">{TABS.map((name) => <button key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)} className={`rounded-full px-3 py-2 text-sm font-semibold ${tab === name ? "bg-brand text-white" : "bg-board"}`}>{name.replace("_", " ")}</button>)}</div><div className="mt-5 rounded-2xl border border-line bg-card p-5">{tab === "overview" && <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(program?.overview ?? {}, null, 2)}</pre>}{tab === "members" && <div className="space-y-2">{(program?.members ?? []).map((member) => <div key={`${member.customer_name}-${member.joined_at}`} className="rounded-xl bg-board p-3">{member.customer_name}</div>)}</div>}{tab === "transactions" && <div className="space-y-2">{(program?.transactions ?? []).map((row) => <div key={row.id} className="rounded-xl bg-board p-3">{row.kind}</div>)}</div>}{tab === "analytics" && <pre>{JSON.stringify(program?.analytics ?? {}, null, 2)}</pre>}{tab === "settings" && <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(program?.settings ?? {}, null, 2)}</pre>}{tab === "reward_usage" && <p>{program?.analytics.stat_c ?? 0}</p>}</div></OwnerShell>;
}
