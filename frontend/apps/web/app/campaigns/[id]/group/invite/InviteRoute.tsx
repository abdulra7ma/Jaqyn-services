"use client";

// Shared by the direct route and the intercepted route-preserving sheet.

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
import { CampaignRouteSheet } from "../../../../_components/CampaignRouteSheet";
import { GroupInvitePanel } from "../../../../_components/groups";
import { useRequireAuth } from "../../../../_lib/auth";

// Groups still in motion (matches the group route + feed banner).
const ACTIVE_STATUSES: GroupSession["status"][] = ["forming", "full", "checking_in", "checked_in"];

export function InviteBody({ campaignId }: { campaignId: string }) {
  const t = useT();
  const router = useRouter();
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

  return (
    <>
      <h1 className="font-display text-[22px] font-bold text-ink">{t("cmp.invite.title")}</h1>
      <p className="mt-1.5 text-[13.5px] text-subtle">
        {t("cmp.invite.subtitle").replace("{count}", String(remaining))}
      </p>

      <GroupInvitePanel session={session} rewardTitle={rewardTitle} />

      {/* sticky back-to-group */}
      <div className="sticky bottom-0 -mx-4 mt-6 bg-gradient-to-t from-cream from-[26%] to-transparent px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3.5">
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
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useRequireAuth();

  return (
    <CustomerShell
      title={t("cmp.invite.title")}
      hideChromeTitle
    >
      {!isAuthenticated ? null : (
        <GroupInviteRouteSheet
          campaignId={id}
          onClose={() => router.push(`/campaigns/${id}/group`)}
        />
      )}
    </CustomerShell>
  );
}

export function GroupInviteRouteSheet({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <CampaignRouteSheet title={t("cmp.invite.title")} onClose={onClose}>
      <InviteBody campaignId={campaignId} />
    </CampaignRouteSheet>
  );
}
