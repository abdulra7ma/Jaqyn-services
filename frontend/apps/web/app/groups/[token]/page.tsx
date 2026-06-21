"use client";

import {
  useCancelGroup,
  useGroup,
  useJoinGroup,
  useLeaveGroup,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge, Button } from "@jaqyn/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import QRCode from "react-qr-code";
import { CustomerShell } from "../../_components/CustomerShell";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { AvatarSlots, dealEmoji, inviteUrl, useCopy } from "../../_components/groups";
import { useErrMessage } from "../../_lib/useErrMessage";
import { useAuth } from "../../_lib/auth";

export default function GroupPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { isAuthenticated, ready } = useAuth();

  const group = useGroup(token);
  const join = useJoinGroup(token);
  const leave = useLeaveGroup(token);
  const cancel = useCancelGroup(token);
  const { copied, copy } = useCopy();

  const [showQr, setShowQr] = useState(false);

  return (
    <CustomerShell title={t("groups.title")} back="/group-offers" showNav={false} hideChromeTitle>
      <QueryBoundary query={group}>
        {(g) => {
          const members = g.members;
          const size = g.group_offer.min_group_size;
          const needed = Math.max(0, size - members.length);
          const link = inviteUrl(token);
          const canInvite = ["forming", "full", "scheduled"].includes(g.status);

          return (
            <div className="flex flex-col gap-4">
              {/* hero */}
              <div className="relative overflow-hidden rounded-3xl bg-brand-gradient p-5 text-brand-fg shadow-glow">
                <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-white/15 text-xl">
                    {dealEmoji(g.group_offer)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-display font-bold">{g.group_offer.business.name}</p>
                    <p className="text-xs opacity-85">
                      {t("groups.visitTime")}: {new Date(g.visit_time).toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className="mt-4 font-display text-xl font-bold leading-tight">
                  {g.group_offer.reward_description}
                </p>
                <div className="mt-4">
                  <AvatarSlots members={members} size={size} variant="onBrand" />
                </div>
                <p className="mt-4 text-sm font-semibold opacity-90">
                  {needed > 0
                    ? `${t("groups.need")} ${needed} ${t("groups.peopleToUnlock")}`
                    : `🎉 ${t("groups.status.full")}`}
                </p>
              </div>

              {/* members */}
              <div className="rounded-2xl border border-line bg-card p-4 shadow-card">
                <ul className="flex flex-col gap-2.5">
                  {members.map((m, i) => (
                    <li key={m.id} className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full font-display text-sm font-bold ${
                          i === 0 ? "bg-brand-muted text-brand" : "bg-board text-ink"
                        }`}
                      >
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm font-semibold text-ink">
                        {m.name}
                        {m.id === "m-self" || (g.is_leader && m.is_leader) ? ` (${t("groups.you")})` : ""}
                      </span>
                      {m.is_leader && <Badge tone="brand">{t("groups.leader")}</Badge>}
                      {m.status === "checked_in" && <Badge tone="ok">✓</Badge>}
                    </li>
                  ))}
                </ul>
              </div>

              {/* reward unlocked */}
              {g.status === "completed" && g.reward_code && (
                <div className="rounded-2xl border border-line bg-card p-4 text-center shadow-card">
                  <p className="text-xs text-subtle">{t("groups.rewardCode")}</p>
                  <p className="my-2 text-3xl font-bold tracking-widest text-brand">{g.reward_code}</p>
                  <p className="text-xs text-subtle">{t("rewards.showStaff")}</p>
                </div>
              )}

              {/* invite link + actions */}
              {canInvite && (
                <>
                  <div className="flex items-center gap-2 rounded-2xl bg-brand-muted px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">🔗 {link}</span>
                    <button
                      onClick={() => copy(link)}
                      className="flex-none rounded-lg bg-brand px-3.5 py-1.5 text-sm font-semibold text-brand-fg"
                    >
                      {copied ? t("common.copied") : t("common.copy")}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setShowQr(true)}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-card py-3 text-sm font-semibold text-ink shadow-card transition hover:border-brand"
                    >
                      <span className="text-base">📷</span>
                      {t("groups.showQr")}
                    </button>
                    <Link href={`/groups/${token}/invite`} className="block">
                      <button className="w-full rounded-2xl bg-brand py-3 text-sm font-semibold text-brand-fg">
                        {t("groups.invite")}
                      </button>
                    </Link>
                  </div>
                </>
              )}

              {/* QR overlay */}
              {showQr && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
                  onClick={() => setShowQr(false)}
                >
                  <div
                    className="flex w-full max-w-xs flex-col items-center gap-4 rounded-3xl bg-card p-6 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="font-display text-base font-bold text-ink">{t("groups.qrHint")}</p>
                    <div className="rounded-2xl bg-white p-4">
                      <QRCode value={link} size={200} />
                    </div>
                    <button
                      onClick={() => setShowQr(false)}
                      className="w-full rounded-2xl border border-line py-2.5 text-sm font-semibold text-subtle"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              )}

              {/* join (non-member) */}
              {ready && !isAuthenticated ? (
                <Link href={`/login?return=${encodeURIComponent(`/groups/${token}`)}`}>
                  <Button className="w-full">{t("auth.login")}</Button>
                </Link>
              ) : !g.is_member && g.status === "forming" ? (
                <div>
                  {join.isError && <p className="mb-2 text-sm text-danger">{errMessage(join.error)}</p>}
                  <Button className="w-full" disabled={join.isPending} onClick={() => join.mutate(g.id)}>
                    {join.isPending ? t("common.loading") : t("groups.join")}
                  </Button>
                </div>
              ) : g.checked_in ? (
                <p className="text-center text-sm text-ok">✓ {t("groups.checkedIn")}</p>
              ) : null}

              {/* leave (member) / cancel (leader) */}
              {g.is_member && canInvite && (
                <div className="flex flex-col items-center gap-1">
                  {(leave.isError || cancel.isError) && (
                    <p className="text-sm text-danger">
                      {errMessage(g.is_leader ? cancel.error : leave.error)}
                    </p>
                  )}
                  <button
                    disabled={leave.isPending || cancel.isPending}
                    onClick={() => {
                      const m = g.is_leader ? cancel : leave;
                      m.mutate(g.id, { onSuccess: () => router.push("/group-offers") });
                    }}
                    className="py-1 text-center text-sm font-semibold text-brand disabled:opacity-50"
                  >
                    {leave.isPending || cancel.isPending
                      ? t("common.loading")
                      : g.is_leader
                        ? t("groups.cancel")
                        : t("groups.leave")}
                  </button>
                </div>
              )}
            </div>
          );
        }}
      </QueryBoundary>
    </CustomerShell>
  );
}
