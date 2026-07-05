"use client";

// Shared by the direct route and the intercepted route-preserving sheet.

import { useCampaign, useJoinCampaign, type Campaign } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CustomerShell } from "../../_components/CustomerShell";
import { CampaignRouteSheet } from "../../_components/CampaignRouteSheet";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { GroupCampaignDetail } from "../../_components/group-detail";
import { howItWorks, missionLine, ruleLines } from "../../_components/campaigns";
import { useRequireAuth } from "../../_lib/auth";

function CtaBar({ campaign }: { campaign: Campaign }) {
  const t = useT();
  const router = useRouter();
  const join = useJoinCampaign();
  const p = campaign.my_progress;

  const onJoin = () => {
    join.mutate(campaign.id, {
      onSuccess: () => {
        if (campaign.campaign_type === "group") router.push(`/campaigns/${campaign.id}/group`);
      },
    });
  };

  let cta: { label: string; onClick: () => void; tone: "brand" | "sage" } | null = null;

  if (p?.completed) {
    cta = {
      label: t("cmp.detail.completed"),
      onClick: () => router.push(p.voucher_id ? `/campaign-wallet/${p.voucher_id}` : "/campaign-wallet"),
      tone: "sage",
    };
  } else if (!p?.joined) {
    cta =
      campaign.campaign_type === "group"
        ? { label: t("cmp.detail.startGroup"), onClick: onJoin, tone: "brand" }
        : { label: t("cmp.detail.join"), onClick: onJoin, tone: "brand" };
  } else if (campaign.campaign_type === "group") {
    cta = {
      label: t("cmp.detail.startGroup"),
      onClick: () => router.push(`/campaigns/${campaign.id}/group`),
      tone: "brand",
    };
  } else {
    cta = {
      label: t("cmp.detail.showQr"),
      onClick: () => router.push("/campaigns/visit-qr"),
      tone: "brand",
    };
  }

  // Ended/cancelled campaigns the customer has not yet completed: show a status
  // notice with a way forward rather than a silent empty CTA area.
  const inactive = (campaign.status === "ended" || campaign.status === "cancelled") && !p?.completed;
  if (inactive) {
    return (
      <div
        className="mt-6 flex flex-col gap-3 rounded-2xl bg-board px-4 py-4"
        role="status"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg" aria-hidden>
            🏁
          </span>
          <p className="font-display text-[15px] font-bold text-ink">
            {t("cmp.detail.ended.notice")}
          </p>
        </div>
        <p className="text-[13px] text-subtle">{t("cmp.detail.ended.body")}</p>
        <div className="flex flex-col gap-2">
          <Link
            href="/campaigns"
            className="rounded-xl bg-card px-4 py-3 text-center text-[13.5px] font-semibold text-ink shadow-[0_2px_8px_rgba(46,36,29,.05)] transition active:opacity-80"
          >
            {t("cmp.detail.ended.backToCampaigns")}
          </Link>
          {p?.voucher_id && (
            <Link
              href="/rewards"
              className="rounded-xl bg-card px-4 py-3 text-center text-[13.5px] font-semibold text-sage shadow-[0_2px_8px_rgba(46,36,29,.05)] transition active:opacity-80"
            >
              {t("cmp.detail.ended.viewReward")}
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!cta) return null;

  return (
    <div className="sticky bottom-0 -mx-4 mt-6 bg-gradient-to-t from-cream from-[26%] to-transparent px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3.5">
      <button
        onClick={cta.onClick}
        disabled={join.isPending}
        className={`w-full rounded-2xl py-4 text-base font-bold text-white transition active:scale-[.99] disabled:opacity-60 ${
          cta.tone === "sage"
            ? "bg-sage shadow-sage"
            : "bg-brand-gradient shadow-glow"
        }`}
      >
        {cta.label}
      </button>
    </div>
  );
}

export default function CampaignDetailPage() {
  const t = useT();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const closeSheet = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/campaigns");
  };

  return (
    <CustomerShell title={t("campaigns.title")} hideChromeTitle>
      <CampaignDetailSheet campaignId={id} onClose={closeSheet} />
    </CustomerShell>
  );
}

export function CampaignDetailSheet({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  // Poll so a staff-side visit/completion reflects live (plan §3).
  const campaign = useCampaign(campaignId, { refetchInterval: 4000 });

  if (!isAuthenticated) return null;

  return (
    <CampaignRouteSheet title={t("campaigns.title")} onClose={onClose}>
      <QueryBoundary query={campaign}>
          {(c) => {
            // Group campaigns get a dedicated, prototype-matching layout
            // (striped hero, info grid, group rules, "Create Group" CTA).
            if (c.campaign_type === "group") return <GroupCampaignDetail campaign={c} />;

            const p = c.my_progress;
            const target = p?.target_count ?? c.rule.required_count ?? 0;
            const pct =
              target > 0 ? Math.min(100, Math.round(((p?.current_count ?? 0) / target) * 100)) : 0;

            return (
              <>
                {/* gradient hero */}
                <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(150deg,#3C2E22,#5A4330)] p-5 text-white">
                  <div className="flex items-center gap-3">
                    {c.business.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.business.logo_url}
                        alt=""
                        width={56}
                        height={56}
                        className="h-14 w-14 flex-none rounded-2xl object-cover"
                        aria-hidden
                      />
                    ) : (
                      <div
                        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-2xl backdrop-blur"
                        aria-hidden
                      >
                        {c.glyph}
                      </div>
                    )}
                    <span className="rounded-pill bg-white/15 px-3 py-1 text-xs font-bold">
                      {t(`cmp.type.${c.campaign_type}`)}
                    </span>
                  </div>
                  <h1 className="mt-3.5 font-display text-2xl font-bold tracking-tight">{c.name}</h1>
                  <p className="mt-1 text-[13px] opacity-85">
                    {c.business.name} · {c.start_label} – {c.end_label}
                  </p>
                </div>

                {/* reward block */}
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-sage-soft px-4 py-3.5">
                  <span className="text-[22px]" aria-hidden>
                    🎁
                  </span>
                  <div>
                    <p className="font-display text-base font-bold text-sage">{c.reward.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-sage-deep">
                      {c.reward.description} ·{" "}
                      {t("cmp.detail.rewardValid").replace(
                        "{days}",
                        String(c.reward.expiry_days_after_unlock),
                      )}
                    </p>
                  </div>
                </div>

                {/* progress (joined individual challenge) */}
                {p?.joined && target > 0 && (
                  <div className="mt-4 rounded-[18px] border border-line bg-card p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] font-semibold text-subtle">
                        {t("cmp.detail.yourProgress")}
                      </span>
                      <span className="font-display text-[17px] font-bold text-ink">
                        {t("cmp.detail.progressValue")
                          .replace("{count}", String(p.current_count))
                          .replace("{total}", String(target))}
                      </span>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-pill bg-board">
                      <div
                        className="h-full rounded-pill bg-brand transition-[width] duration-700 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-2.5 text-[12.5px] text-subtle">{t("cmp.detail.progressHint")}</p>
                  </div>
                )}

                {/* challenge */}
                <h2 className="mt-6 font-display text-[15px] font-bold text-ink">
                  {t("cmp.detail.challenge")}
                </h2>
                <div className="mt-2.5 flex items-center gap-3 rounded-2xl bg-amber/12 p-3.5">
                  <span className="text-lg" aria-hidden>
                    🎯
                  </span>
                  <span className="text-sm font-semibold text-amber-deep">{missionLine(t, c)}</span>
                </div>

                {/* how it works */}
                <h2 className="mt-6 font-display text-[15px] font-bold text-ink">
                  {t("cmp.detail.howItWorks")}
                </h2>
                <ol className="mt-2.5 flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
                  {howItWorks(t, c.campaign_type).map((step, i) => (
                    <li key={i} className="flex items-center gap-3 bg-card px-4 py-3.5">
                      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-muted font-display text-xs font-extrabold text-brand">
                        {i + 1}
                      </span>
                      <span className="text-[13.5px] leading-snug text-ink">{step}</span>
                    </li>
                  ))}
                </ol>

                {/* rules */}
                <h2 className="mt-6 font-display text-[15px] font-bold text-ink">
                  {t("cmp.detail.rules")}
                </h2>
                <ul className="mt-2.5 flex flex-col gap-2">
                  {ruleLines(t, c).map((rule, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-subtle">
                      <span className="font-bold text-brand" aria-hidden>
                        ·
                      </span>
                      {rule}
                    </li>
                  ))}
                </ul>

                <CtaBar campaign={c} />
              </>
            );
          }}
      </QueryBoundary>
    </CampaignRouteSheet>
  );
}
