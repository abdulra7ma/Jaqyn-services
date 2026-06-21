"use client";

import { useRedeemGroup, useStaffGroups, useVerifyGroup } from "@jaqyn/api";
import type { StaffGroup } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge, Button, Card } from "@jaqyn/ui";
import Link from "next/link";
import { StaffShell } from "../_components/StaffShell";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { useErrMessage } from "../../_lib/useErrMessage";
import { useStaffAuth } from "../_lib/staffAuth";

function fmtTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function StaffGroupsPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const { isStaff, ready } = useStaffAuth();
  const groups = useStaffGroups(isStaff);
  const verify = useVerifyGroup();
  const redeem = useRedeemGroup();

  return (
    <StaffShell title={t("staff.title")}>
      {!ready ? null : !isStaff ? (
        <Card>
          <p className="text-sm text-subtle">{t("staff.login")}</p>
          <Link href="/staff/login" className="mt-3 block">
            <Button className="w-full">{t("staff.signIn")}</Button>
          </Link>
        </Card>
      ) : (
        <QueryBoundary query={groups}>
          {(list) =>
            list.length === 0 ? (
              <div className="py-10 text-center text-subtle">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-line text-[28px]">👥</div>
                <div className="mt-4 font-display text-[17px] font-bold text-ink">{t("staff.groups.emptyTitle")}</div>
                <p className="mt-1.5 text-[13.5px]">{t("staff.groups.emptyHint")}</p>
              </div>
            ) : (
              <div className="flex animate-[jqIn_.3s_ease] flex-col gap-6">
                {(verify.isError || redeem.isError) && (
                  <p className="text-sm text-danger">{errMessage(verify.error || redeem.error)}</p>
                )}
                {list.map((g) => (
                  <GroupCard
                    key={g.id}
                    g={g}
                    onComplete={() => verify.mutate(g.id)}
                    onRedeem={() => redeem.mutate(g.id)}
                    busy={verify.isPending || redeem.isPending}
                  />
                ))}
              </div>
            )
          }
        </QueryBoundary>
      )}
    </StaffShell>
  );
}

function GroupCard({
  g,
  onComplete,
  onRedeem,
  busy,
}: {
  g: StaffGroup;
  onComplete: () => void;
  onRedeem: () => void;
  busy: boolean;
}) {
  const t = useT();
  const checkedIn = g.members.filter((m) => m.status === "checked_in").length;
  const size = g.group_offer.min_group_size;
  const completed = g.status === "completed";

  return (
    <div>
      <p className="mb-3 text-[13.5px] font-semibold text-subtle">{t("staff.groups.arriving")}</p>
      <Card className="!rounded-[20px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-[17px] font-bold leading-tight text-ink">{g.group_offer.title}</div>
            <div className="mt-1 text-[12.5px] text-subtle">
              {fmtTime(g.visit_time)} · {g.members.length}
            </div>
          </div>
          <Badge tone={completed ? "ok" : "brand"}>{g.status}</Badge>
        </div>

        <div className="mt-4 rounded-xl bg-brand-muted/60 px-3.5 py-3 text-[12.5px] text-amber-deep">
          {t("staff.groups.required")}: {size} · {checkedIn}/{g.members.length} {t("staff.groups.checkedIn")}
        </div>

        <div className="mb-2.5 mt-4 text-[12.5px] font-semibold text-subtle">
          {checkedIn}/{g.members.length}
        </div>
        <div className="flex flex-col gap-2.5">
          {g.members.map((m) => {
            const isIn = m.status === "checked_in";
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-[14px] border border-line bg-cream/60 px-3.5 py-3"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold ${
                    isIn ? "bg-sage text-white" : "border-2 border-dashed border-line text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="flex-1 text-[14.5px] font-semibold text-ink">
                  {m.customer_name ?? m.customer}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      {completed && g.reward_code ? (
        <div className="mt-4 flex flex-col items-center gap-1 rounded-2xl bg-sage-soft px-5 py-5">
          <span className="font-display text-[17px] font-bold text-ok">✓ {t("staff.groups.redeemed")}</span>
          <span className="font-display text-2xl font-extrabold tracking-widest text-ok">{g.reward_code}</span>
        </div>
      ) : (
        <>
          <button
            onClick={onComplete}
            disabled={busy}
            className="mt-4 w-full rounded-2xl border-[1.5px] border-line bg-card py-4 font-display text-base font-bold text-ink transition hover:bg-board/40 disabled:opacity-50"
          >
            {t("staff.groups.complete")}
          </button>
          <button
            onClick={onRedeem}
            disabled={busy}
            className="mt-3 w-full rounded-2xl bg-sage py-5 font-display text-lg font-bold text-white shadow-sage transition hover:brightness-105 disabled:opacity-50"
          >
            {t("staff.groups.redeem")}
          </button>
        </>
      )}
    </div>
  );
}
