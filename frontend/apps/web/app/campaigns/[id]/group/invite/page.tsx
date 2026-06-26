"use client";

import {
  useCampaign,
  useGroupSession,
  useMyGroups,
  type GroupSession,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { ErrorState, Loading } from "@jaqyn/ui";
import { useParams, useRouter } from "next/navigation";
import { CustomerShell } from "../../../../_components/CustomerShell";
import { hhmm, inviteUrl, useCopy } from "../../../../_components/groups";
import { useRequireAuth } from "../../../../_lib/auth";

// Groups still in motion (matches the group route + feed banner).
const ACTIVE_STATUSES: GroupSession["status"][] = ["forming", "full", "checking_in", "checked_in"];

/** One full-width share row (icon + label) opening a platform share URL. */
function ShareRow({ label, href, onClick }: { label: string; href?: string; onClick?: () => void }) {
  const cls =
    "flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 text-[14px] font-semibold text-ink transition active:scale-[.99]";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        <span aria-hidden>📤</span>
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <span aria-hidden>📤</span>
      {label}
    </button>
  );
}

function InviteBody({ campaignId }: { campaignId: string }) {
  const t = useT();
  const router = useRouter();
  const { copied, copy } = useCopy();
  const myGroups = useMyGroups();
  const campaign = useCampaign(campaignId);

  const activeGroup = myGroups.data?.find(
    (g) => g.campaign_id === campaignId && ACTIVE_STATUSES.includes(g.status),
  );
  const sessionQuery = useGroupSession(activeGroup?.id ?? "");

  if (myGroups.isLoading || campaign.isLoading) return <Loading label={t("common.loading")} />;
  if (myGroups.isError || campaign.isError) {
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
  // No active group → nothing to invite to; send the user back to the group route.
  if (!activeGroup || !sessionQuery.data) {
    if (sessionQuery.isLoading) return <Loading label={t("common.loading")} />;
    return (
      <ErrorState
        message={t("common.error")}
        onRetry={() => router.push(`/campaigns/${campaignId}/group`)}
        retryLabel={t("cmp.invite.back")}
      />
    );
  }

  const session = sessionQuery.data;
  const remaining = Math.max(0, session.required_size - session.joined_count);
  const rewardTitle = campaign.data?.reward.title ?? "";
  const link = inviteUrl(session.invite_code, session.invite_url);
  const message = t("cmp.invite.message")
    .replace("{business}", session.business_name)
    .replace("{count}", String(remaining))
    .replace("{reward}", rewardTitle)
    .replace("{time}", hhmm(session.visit_time));

  const shareText = `${message} ${link}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const tgHref = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`;

  return (
    <>
      <h1 className="font-display text-[22px] font-bold text-ink">{t("cmp.invite.title")}</h1>
      <p className="mt-1.5 text-[13.5px] text-subtle">
        {t("cmp.invite.subtitle").replace("{count}", String(remaining))}
      </p>

      {/* pre-written message */}
      <div className="mt-5 rounded-2xl border border-line bg-card p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-subtle">
          {t("cmp.invite.prewritten")}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-ink">{message}</p>
      </div>

      {/* invite link + copy */}
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

      {/* share rows */}
      <div className="mt-4 flex flex-col gap-2.5">
        <ShareRow label={t("cmp.invite.whatsapp")} href={waHref} />
        <ShareRow label={t("cmp.invite.telegram")} href={tgHref} />
        {/* Instagram has no web share-with-text intent — copy the message and open IG. */}
        <ShareRow
          label={t("cmp.invite.instagram")}
          onClick={() => {
            copy(shareText);
            window.open("https://instagram.com", "_blank", "noopener,noreferrer");
          }}
        />
      </div>

      {/* sticky back-to-group */}
      <div className="sticky bottom-0 -mx-4 mt-6 bg-gradient-to-t from-cream from-[26%] to-transparent px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3.5 sm:-mx-6 sm:px-6">
        <button
          onClick={() => router.push(`/campaigns/${campaignId}/group`)}
          className="w-full rounded-2xl bg-brand-gradient py-4 text-base font-bold text-white shadow-glow transition active:scale-[.99]"
        >
          {t("cmp.invite.back")}
        </button>
      </div>
    </>
  );
}

export default function GroupInvitePage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useRequireAuth();

  return (
    <CustomerShell
      title={t("cmp.invite.title")}
      back={`/campaigns/${id}/group`}
      showNav={false}
      hideChromeTitle
    >
      {!isAuthenticated ? null : <InviteBody campaignId={id} />}
    </CustomerShell>
  );
}
