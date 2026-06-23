"use client";

import { useInviteToGroupSession, useStartGroupSession } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { ErrorState, Loading } from "@jaqyn/ui";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import QRCode from "react-qr-code";
import { CustomerShell } from "../../../_components/CustomerShell";
import { GroupMemberRow } from "../../../_components/campaigns";
import { useCopy } from "../../../_components/groups";
import { useRequireAuth } from "../../../_lib/auth";

function GroupBody({ campaignId }: { campaignId: string }) {
  const t = useT();
  const router = useRouter();
  const start = useStartGroupSession();
  const invite = useInviteToGroupSession();
  const { copied, copy } = useCopy();

  // Source of truth for the session is the mutation result, not local state:
  // the invite mutation supersedes the start result. Reading from `data`
  // survives React Strict Mode's mount/unmount/mount cycle, where an
  // effect-stored `onSuccess` value would be lost.
  const session = invite.data ?? start.data ?? null;

  // Start a session for this campaign once. Keyed on `isIdle` so the live
  // observer fires after a Strict-Mode remount rather than being blocked by a ref.
  useEffect(() => {
    if (start.isIdle) start.mutate(campaignId);
  }, [campaignId, start]);

  if (start.isError) {
    return (
      <ErrorState
        message={t("common.error")}
        onRetry={() => start.reset()}
        retryLabel={t("common.retry")}
      />
    );
  }
  if (!session) return <Loading label={t("common.loading")} />;

  const pct =
    session.required_size > 0
      ? Math.min(100, Math.round((session.joined_count / session.required_size) * 100))
      : 0;
  const inviteLink = `jaqyn.kg/g/${session.invite_code}`;
  const isFull = session.status === "full" || session.joined_count >= session.required_size;
  const isDone = session.status === "completed";

  return (
    <>
      <h1 className="font-display text-[22px] font-bold text-ink">{session.campaign.name}</h1>
      <p className="mt-1 text-[13.5px] text-subtle">{t("cmp.group.blurb")}</p>

      {/* progress + members */}
      <div className="mt-4 rounded-[20px] border border-line bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-subtle">{t("cmp.group.progress")}</span>
          <span className="font-display text-[17px] font-bold text-ink">
            {t("cmp.group.joinedLabel")
              .replace("{count}", String(session.joined_count))
              .replace("{size}", String(session.required_size))}
          </span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-pill bg-board">
          <div className="h-full rounded-pill bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          {session.members.map((m) => (
            <GroupMemberRow key={m.id} member={m} />
          ))}
        </div>
      </div>

      {/* invite link + fill (forming) */}
      {!isFull && !isDone && (
        <>
          <div className="mt-3.5 flex items-center gap-2.5 rounded-2xl border border-dashed border-line bg-cream px-4 py-3.5">
            <span aria-hidden>🔗</span>
            <span className="flex-1 truncate font-mono text-[13px] font-semibold text-subtle">
              {inviteLink}
            </span>
            <button
              onClick={() => copy(inviteLink)}
              className="flex-none rounded-lg bg-brand-muted px-3 py-1.5 text-xs font-bold text-brand"
            >
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>
          <button
            onClick={() => invite.mutate(session.id)}
            disabled={invite.isPending}
            className="mt-3 w-full rounded-[15px] bg-brand-gradient py-3.5 text-[15px] font-bold text-brand-fg shadow-glow transition active:scale-[.99] disabled:opacity-60"
          >
            {t("cmp.group.invite")}
          </button>
        </>
      )}

      {/* group full → check-in QR */}
      {isFull && !isDone && session.checkin_token && (
        <>
          <div className="mx-auto mt-5 w-max rounded-[24px] border border-[#EDEDED] bg-card p-4 shadow-card">
            <QRCode value={session.checkin_token} size={176} />
          </div>
          <p className="mt-3 text-center text-[13px] text-subtle">{t("cmp.group.inviteHint")}</p>
        </>
      )}

      {/* completed → reward unlocked */}
      {isDone && (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-sage-soft p-4">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-sage text-lg text-white">
              ✓
            </span>
            <div>
              <p className="font-display text-[15px] font-bold text-sage">
                {t("cmp.group.unlocked")}
              </p>
              <p className="mt-0.5 text-[12.5px] text-sage-deep">{t("cmp.group.unlockedHint")}</p>
            </div>
          </div>
          <button
            onClick={() => router.push("/campaign-wallet")}
            className="mt-3.5 w-full rounded-[15px] bg-sage py-3.5 text-[15px] font-bold text-white shadow-sage transition active:scale-[.99]"
          >
            {t("cmp.group.toWallet")}
          </button>
        </>
      )}
    </>
  );
}

export default function GroupSessionPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useRequireAuth();

  return (
    <CustomerShell title={t("cmp.nav.group")} back={`/campaigns/${id}`} showNav={false} hideChromeTitle>
      {!isAuthenticated ? null : <GroupBody campaignId={id} />}
    </CustomerShell>
  );
}
