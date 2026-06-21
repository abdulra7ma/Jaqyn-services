"use client";

import { useGroupOffer } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button } from "@jaqyn/ui";
import { useParams, useRouter } from "next/navigation";
import { CustomerShell } from "../../_components/CustomerShell";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { OfferCover, CoverTag, dealEmoji } from "../../_components/groups";
import { useAuth } from "../../_lib/auth";

const catLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-3.5">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-1 font-bold text-ink">{value}</p>
    </div>
  );
}

export default function GroupOfferDetailPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, ready } = useAuth();

  const offer = useGroupOffer(id);

  const start = () => {
    if (isAuthenticated) router.push(`/group-offers/${id}/create`);
    else router.push(`/login?return=${encodeURIComponent(`/group-offers/${id}/create`)}`);
  };

  return (
    <CustomerShell title={t("groups.deals.title")} back="/group-offers" showNav={false} hideChromeTitle>
      <QueryBoundary query={offer}>
        {(o) => {
          const size = `${o.min_group_size}${o.max_group_size ? `–${o.max_group_size}` : "+"} ${t("groups.peopleShort")}`;
          const rules = [
            ...(o.terms ? o.terms.split(/[\n.]+/).map((s) => s.trim()).filter(Boolean) : []),
            `${t("groups.ruleCheckinPre")} ${o.checkin_window_minutes} ${t("groups.minutes")}`,
            t("groups.ruleOneReward"),
          ];
          return (
            <div className="flex flex-col gap-5 pb-24">
              <OfferCover
                emoji={dealEmoji(o)}
                className="h-44"
                topLeft={<CoverTag>{t(`groups.type.${o.reward_type}`)}</CoverTag>}
              />

              <div>
                <p className="text-sm text-subtle">
                  <span className="font-semibold text-ink">{o.business.name}</span>
                  {` · ${catLabel(o.business.category)}`}
                  {o.business.area ? ` · ${o.business.area}` : ""}
                </p>
                <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-tight text-ink">
                  {o.title}
                </h1>
                <p className="mt-3 text-[15px] leading-relaxed text-subtle">{o.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <Fact label={t("groups.reward")} value={o.reward_description} />
                <Fact label={t("groups.groupSize")} value={size} />
                <Fact label={t("groups.valid")} value={`${o.time_start}–${o.time_end}`} />
                <Fact
                  label={t("groups.checkinWindow")}
                  value={`${o.checkin_window_minutes} ${t("groups.minutes")}`}
                />
              </div>

              <div>
                <h2 className="font-display font-bold text-ink">{t("groups.rules")}</h2>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {rules.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-subtle">
                      <span className="text-brand">·</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              {/* sticky CTA on mobile, inline on desktop */}
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-cream/95 p-4 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
                <div className="mx-auto max-w-2xl">
                  <Button className="w-full" disabled={!ready} onClick={start}>
                    {t("groups.create")}
                  </Button>
                </div>
              </div>
            </div>
          );
        }}
      </QueryBoundary>
    </CustomerShell>
  );
}
