"use client";

// Shared by the direct route and the intercepted route-preserving sheet.

import {
  useCampaign,
  useDemoFillGroup,
  useGroupSession,
  useLeaveGroupSession,
  useMyGroups,
  useStartGroupSession,
  type Campaign,
  type GroupSession,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { ErrorState, Loading, Sheet } from "@jaqyn/ui";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { CustomerShell } from "../../../_components/CustomerShell";
import { CampaignRouteSheet } from "../../../_components/CampaignRouteSheet";
import { GlyphTile, GroupMemberRow } from "../../../_components/campaigns";
import {
  AvatarSlots,
  buildVisitSlots,
  GroupInvitePanel,
  hhmm,
  inviteUrl,
  useCopy,
} from "../../../_components/groups";
import { useRequireAuth } from "../../../_lib/auth";

// Groups still in motion (not completed / expired / cancelled). Matches the feed.
const ACTIVE_STATUSES: GroupSession["status"][] = ["forming", "full", "checking_in", "checked_in"];

// DEV/testing aid: the "simulate friends" button is hidden unless this is set.
// The backend also gates the endpoint on DEBUG, so prod never exposes it.
const DEMO_MODE = !!process.env.NEXT_PUBLIC_DEMO_MODE;

// ---------------------------------------------------------------------------
// SCREEN 3 — Create group form (no active group for this campaign yet).
// ---------------------------------------------------------------------------
function CreateGroupForm({ campaign }: { campaign: Campaign }) {
  const t = useT();
  const start = useStartGroupSession();

  const slots = useMemo(
    () =>
      buildVisitSlots(
        campaign.active_start_time,
        campaign.active_end_time,
        campaign.rule.group_checkin_window_minutes,
      ),
    [campaign.active_start_time, campaign.active_end_time, campaign.rule.group_checkin_window_minutes],
  );
  // First slot selected by default (index into `slots`).
  const [selected, setSelected] = useState(0);
  const [customTime, setCustomTime] = useState("");
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const size = campaign.rule.required_group_size ?? 0;
  const earliestCustomTime = slots[0] ? hhmm(slots[0]) : "";

  const onSubmit = () => {
    const slot = useCustomTime
      ? (() => {
          const [hours, minutes] = customTime.split(":").map(Number);
          if (
            !Number.isInteger(hours) ||
            !Number.isInteger(minutes) ||
            customTime < earliestCustomTime ||
            (campaign.active_end_time && customTime > campaign.active_end_time)
          ) {
            return undefined;
          }
          const custom = new Date();
          custom.setHours(hours as number, minutes as number, 0, 0);
          return custom;
        })()
      : slots[selected];
    if (!slot) return;
    start.mutate({
      campaignId: campaign.id,
      visit_time: slot ? slot.toISOString() : undefined,
      name: name.trim() || undefined,
      note: note.trim() || undefined,
    });
    // On success useMyGroups is invalidated; the page re-resolves to the forming
    // view (the started session id is also written into the cache by the hook).
  };

  return (
    <>
      <h1 className="font-display text-[22px] font-bold text-ink">{t("cmp.group.create.title")}</h1>

      {/* business summary card */}
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
        <GlyphTile glyph="👥" size={46} image={campaign.business.logo_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold text-ink">{campaign.business.name}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-subtle">
            {t("cmp.group.create.summary")
              .replace("{reward}", campaign.reward.title)
              .replace("{count}", String(size))}
          </p>
        </div>
      </div>

      {/* visit-time slots */}
      <h2 className="sticky top-12 z-[1] -mx-1 mt-6 bg-cream/95 px-1 py-2 text-[13px] font-semibold text-subtle backdrop-blur">
        {t("cmp.group.create.pickTime")
          .replace("{start}", campaign.active_start_time || "—")
          .replace("{end}", campaign.active_end_time || "—")}
      </h2>
      {slots.length === 0 ? (
        <p className="mt-2 rounded-xl border border-line bg-card p-3 text-[13px] text-subtle">
          {t("cmp.group.create.noTimesToday")}
        </p>
      ) : (
        <>
        <div className="mt-3 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={t("cmp.group.create.pickTime")}>
          {slots.map((slot, i) => {
            const isSel = i === selected;
            return (
              <button
                key={slot.toISOString()}
                type="button"
                role="radio"
                aria-checked={isSel}
                onClick={() => {
                  setSelected(i);
                  setUseCustomTime(false);
                }}
                className={
                  isSel
                    ? "rounded-xl border-2 border-brand bg-brand-muted px-3 py-3 text-[14px] font-bold text-brand transition"
                    : "rounded-xl border border-line bg-card px-3 py-3 text-[14px] font-semibold text-ink transition active:scale-[.98]"
                }
              >
                {t("cmp.group.create.slotLabel").replace("{time}", hhmm(slot))}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={useCustomTime}
            onClick={() => setUseCustomTime(true)}
            className={
              useCustomTime
                ? "rounded-xl border-2 border-brand bg-brand-muted px-3 py-3 text-[14px] font-bold text-brand transition"
                : "rounded-xl border border-line bg-card px-3 py-3 text-[14px] font-semibold text-ink transition active:scale-[.98]"
            }
          >
            {t("cmp.group.create.customTime")}
          </button>
        </div>
        {useCustomTime && (
          <label className="mt-3 block text-[13px] font-semibold text-subtle">
            {t("cmp.group.create.customTimeLabel")}
            <input
              type="time"
              value={customTime}
              min={earliestCustomTime}
              max={campaign.active_end_time || undefined}
              onChange={(event) => setCustomTime(event.target.value)}
              className="mt-2 w-full rounded-xl border border-line bg-card px-4 py-3 text-[14px] font-semibold text-ink outline-none focus:border-brand"
            />
          </label>
        )}
        </>
      )}

      {/* group name */}
      <label className="mt-6 block text-[13px] font-semibold text-subtle" htmlFor="group-name">
        {t("cmp.group.create.name")}
      </label>
      <input
        id="group-name"
        type="text"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("cmp.group.create.namePlaceholder")}
        className="mt-2 w-full rounded-xl border border-line bg-card px-4 py-3 text-[14px] text-ink outline-none placeholder:text-subtle focus:border-brand"
      />

      {/* note to friends */}
      <label className="mt-4 block text-[13px] font-semibold text-subtle" htmlFor="group-note">
        {t("cmp.group.create.note")}
      </label>
      <textarea
        id="group-note"
        value={note}
        rows={3}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("cmp.group.create.notePlaceholder")}
        className="mt-2 w-full resize-none rounded-xl border border-line bg-card px-4 py-3 text-[14px] text-ink outline-none placeholder:text-subtle focus:border-brand"
      />

      {start.isError && (
        <p className="mt-3 text-[13px] text-danger">{t("common.error")}</p>
      )}

      {/* sticky CTA */}
      <div className="sticky bottom-0 -mx-4 mt-6 bg-gradient-to-t from-cream from-[26%] to-transparent px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3.5">
        <button
          onClick={onSubmit}
          disabled={start.isPending || (useCustomTime && !customTime) || slots.length === 0}
          className="w-full rounded-2xl bg-brand-gradient py-4 text-base font-bold text-white shadow-glow transition active:scale-[.99] disabled:opacity-60"
        >
          {t("cmp.group.create.submit")}
        </button>
      </div>
    </>
  );
}

/**
 * Share content for the invite Sheet. Wraps the shared GroupInvitePanel (editable
 * message + dynamic link + platform share rows) with the sheet's heading and a
 * close CTA. The full-page /invite route reuses the same panel.
 */
function InviteSheetContent({
  session,
  rewardTitle,
  onClose,
}: {
  session: GroupSession;
  rewardTitle: string;
  onClose: () => void;
}) {
  const t = useT();
  const remaining = Math.max(0, session.required_size - session.joined_count);

  return (
    <>
      <h2 className="font-display text-[22px] font-bold text-ink">{t("cmp.invite.title")}</h2>
      <p className="mt-1.5 text-[13.5px] text-subtle">
        {t("cmp.invite.subtitle").replace("{count}", String(remaining))}
      </p>

      <GroupInvitePanel session={session} rewardTitle={rewardTitle} />

      {/* close / back to group */}
      <div className="sticky bottom-0 -mx-[22px] mt-6 bg-gradient-to-t from-card from-[26%] to-transparent px-[22px] pb-[calc(16px+env(safe-area-inset-bottom))] pt-3.5">
        <button
          onClick={onClose}
          className="w-full rounded-2xl bg-brand-gradient py-4 text-base font-bold text-white shadow-glow transition active:scale-[.99]"
        >
          {t("cmp.invite.back")}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// SCREEN 4 — Forming / full / completed group session.
// ---------------------------------------------------------------------------
function GroupSessionView({
  campaignId,
  sessionId,
  rewardTitle,
}: {
  campaignId: string;
  sessionId: string;
  rewardTitle: string;
}) {
  const t = useT();
  const router = useRouter();
  // Poll so demo-fill / real joins reflect live (mirrors the detail page).
  const query = useGroupSession(sessionId, { refetchInterval: 4000 });
  const demoFill = useDemoFillGroup();
  const leave = useLeaveGroupSession();
  const { copied, copy } = useCopy();
  const [inviteOpen, setInviteOpen] = useState(false);

  if (query.isError) {
    return (
      <ErrorState message={t("common.error")} onRetry={() => query.refetch()} retryLabel={t("common.retry")} />
    );
  }
  if (!query.data) return <Loading label={t("common.loading")} />;

  const session = query.data;
  const remaining = Math.max(0, session.required_size - session.joined_count);
  const isFull = session.status === "full" || session.joined_count >= session.required_size;
  const isDone = session.status === "completed";
  // The real, origin-aware invite deep link (`<frontend>/q/<token>`).
  const link = inviteUrl(session.invite_code, session.invite_url);

  return (
    <>
      {/* Invite sheet — opens over this screen when "Invite friends" is tapped.
          The full-page /invite route stays as the deep-link fallback. */}
      <Sheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        ariaLabel={t("cmp.invite.title")}
        variant="modal"
      >
        <InviteSheetContent
          session={session}
          rewardTitle={rewardTitle}
          onClose={() => setInviteOpen(false)}
        />
      </Sheet>

      {/* gradient header card */}
      <div className="overflow-hidden rounded-3xl bg-[linear-gradient(150deg,#C25E3C,#E7A23E)] p-5 text-white shadow-glow">
        <div className="flex items-center gap-3">
          <GlyphTile glyph="👥" size={44} image={session.business_logo_url} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold opacity-90">{session.business_name}</p>
            {session.visit_time && (
              <p className="text-[12.5px] opacity-85">
                {t("cmp.group.visitAt").replace("{time}", hhmm(session.visit_time))}
              </p>
            )}
          </div>
        </div>
        <h1 className="mt-3.5 font-display text-2xl font-bold tracking-tight">{session.campaign.name}</h1>
        <div className="mt-4">
          <AvatarSlots members={session.members} requiredSize={session.required_size} />
        </div>
        <p className="mt-3 text-[13px] font-semibold opacity-95">
          {isFull
            ? t("cmp.group.ready")
            : t("cmp.group.needMore").replace("{count}", String(remaining))}
        </p>
      </div>

      {/* member list */}
      <div className="mt-4 flex flex-col gap-2.5 rounded-[20px] border border-line bg-card p-4">
        {session.members.map((m) => (
          <GroupMemberRow key={m.id} member={m} />
        ))}
      </div>

      {/* invite link + actions (forming / full, not done) */}
      {!isDone && (
        <>
          <div className="mt-3.5 flex items-center gap-2.5 rounded-2xl border border-dashed border-line bg-cream px-4 py-3.5">
            <span aria-hidden>🔗</span>
            <span className="flex-1 truncate font-mono text-[13px] font-semibold text-subtle">{link}</span>
            <button
              onClick={() => copy(link)}
              className="flex-none rounded-lg bg-brand-muted px-3 py-1.5 text-xs font-bold text-brand"
            >
              {copied ? t("common.copied") : t("common.copy")}
            </button>
          </div>

          <button
            onClick={() => setInviteOpen(true)}
            className="mt-3 w-full rounded-[15px] bg-brand-gradient py-3.5 text-[15px] font-bold text-brand-fg shadow-glow transition active:scale-[.99]"
          >
            {t("cmp.group.inviteFriends")}
          </button>

          {DEMO_MODE && (
            <button
              onClick={() => demoFill.mutate(session.id)}
              disabled={demoFill.isPending}
              className="mt-2.5 w-full rounded-[15px] border border-line bg-card py-3 text-[14px] font-semibold text-subtle transition active:scale-[.99] disabled:opacity-60"
            >
              {t("cmp.group.demoFill")}
            </button>
          )}
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
              <p className="font-display text-[15px] font-bold text-sage">{t("cmp.group.unlocked")}</p>
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

      {/* leave group (forming / full, not done) */}
      {!isDone && (
        <button
          onClick={() =>
            leave.mutate(session.id, {
              onSuccess: () => router.push(`/campaigns/${campaignId}`),
            })
          }
          disabled={leave.isPending}
          className="mx-auto mt-5 block text-[13px] font-semibold text-subtle underline-offset-2 hover:text-brand hover:underline disabled:opacity-60"
        >
          {t("cmp.group.leave")}
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Route: resolve the active group for this campaign, then branch.
// ---------------------------------------------------------------------------
export function GroupBody({ campaignId }: { campaignId: string }) {
  const t = useT();
  const myGroups = useMyGroups();
  const campaign = useCampaign(campaignId);

  // An active group for THIS campaign means render the forming view; else create.
  const activeGroup = myGroups.data?.find(
    (g) => g.campaign_id === campaignId && ACTIVE_STATUSES.includes(g.status),
  );

  if (myGroups.isLoading || campaign.isLoading) return <Loading label={t("common.loading")} />;
  if (myGroups.isError || campaign.isError || !campaign.data) {
    return (
      <ErrorState
        message={t("common.error")}
        onRetry={() => {
          myGroups.refetch();
          campaign.refetch();
        }}
        retryLabel={t("common.retry")}
      />
    );
  }

  if (activeGroup) {
    return (
      <GroupSessionView
        campaignId={campaignId}
        sessionId={activeGroup.id}
        rewardTitle={campaign.data?.reward.title ?? ""}
      />
    );
  }
  return <CreateGroupForm campaign={campaign.data} />;
}

export default function GroupSessionPage() {
  const t = useT();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useRequireAuth();

  // Return to wherever the user came from (the tab's active-group banner, an
  // in-progress row, discover, an invite link…) rather than a fixed parent. The
  // campaign detail is the "create/join" screen — sending an already-joined member
  // there on back is the loop we're avoiding. Fall back to the tab on a cold deep
  // link with no in-app history.
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/campaigns");
    }
  };

  return (
    <CustomerShell title={t("cmp.nav.group")} hideChromeTitle>
      {!isAuthenticated ? null : <GroupRouteSheet campaignId={id} onClose={goBack} />}
    </CustomerShell>
  );
}

export function GroupRouteSheet({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <CampaignRouteSheet title={t("cmp.nav.group")} onClose={onClose}>
      <GroupBody campaignId={campaignId} />
    </CampaignRouteSheet>
  );
}
