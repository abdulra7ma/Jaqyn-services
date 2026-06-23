"use client";

import { useCampaigns } from "@jaqyn/api";
import type { CampaignListParams } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import { useState } from "react";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { CampaignCard, CampaignCarouselCard } from "../_components/campaigns";
import { PageTitle } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";

// Discover filter chips → the params handed to useCampaigns. "All" clears every
// filter; the type chips map onto the backend campaign_type enum (underscored
// "time_window"); "In progress" restricts to the viewer's joined campaigns.
type DiscoverFilter = "all" | "visits" | "timewindow" | "group" | "inProgress";

const FILTER_PARAMS: Record<DiscoverFilter, CampaignListParams> = {
  all: {},
  visits: { type: "visit" },
  timewindow: { type: "time_window" },
  group: { type: "group" },
  inProgress: { joined: true },
};

const FILTER_ORDER: DiscoverFilter[] = ["all", "visits", "timewindow", "group", "inProgress"];

const FILTER_LABEL_KEY: Record<DiscoverFilter, string> = {
  all: "cmp.filter.all",
  visits: "cmp.filter.visits",
  timewindow: "cmp.filter.timewindow",
  group: "cmp.filter.group",
  inProgress: "cmp.filter.inProgress",
};

// "From places you go" — a horizontal, swipeable carousel of the customer's
// joined / in-progress campaigns. Hidden entirely when they've joined none.
function JoinedCarousel() {
  const t = useT();
  const joined = useCampaigns({ joined: true });
  const list = joined.data ?? [];
  if (list.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold text-ink">{t("cmp.places.title")}</h2>
        <span className="text-[13px] font-semibold text-subtle">
          {t("cmp.places.count").replace("{count}", String(list.length))}
        </span>
      </div>
      <div className="-mx-5 mt-3 flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((c) => (
          <div key={c.id} className="snap-start">
            <CampaignCarouselCard campaign={c} />
          </div>
        ))}
      </div>
    </section>
  );
}

// "Discover more" — filter chips + a vertical list. The selected chip is local UI
// state; its mapped params drive a separate useCampaigns query (cached per filter).
function DiscoverSection() {
  const t = useT();
  const [filter, setFilter] = useState<DiscoverFilter>("all");
  const campaigns = useCampaigns(FILTER_PARAMS[filter]);

  return (
    <section className="mt-7">
      <h2 className="font-display text-lg font-bold text-ink">{t("cmp.discover.more")}</h2>
      <div
        className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={t("cmp.discover.more")}
      >
        {FILTER_ORDER.map((key) => {
          const selected = filter === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setFilter(key)}
              className={cn(
                "flex-none rounded-pill border px-3.5 py-1.5 text-[13px] font-semibold transition",
                selected
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-card text-subtle active:scale-[.98]",
              )}
            >
              {t(FILTER_LABEL_KEY[key])}
            </button>
          );
        })}
      </div>

      <QueryBoundary
        query={campaigns}
        isEmpty={(list) => list.length === 0}
        emptyMessage={t("cmp.discover.empty")}
      >
        {(list) => (
          <div className="mt-4 flex flex-col gap-3.5">
            {list.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        )}
      </QueryBoundary>
    </section>
  );
}

export default function CampaignsDiscoverPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();

  return (
    <CustomerShell title={t("campaigns.title")} hideChromeTitle>
      {!isAuthenticated ? null : (
        <>
          <PageTitle>{t("campaigns.title")}</PageTitle>
          <p className="mt-1 text-[13.5px] text-subtle">{t("cmp.discover.subtitle")}</p>
          <JoinedCarousel />
          <DiscoverSection />
        </>
      )}
    </CustomerShell>
  );
}
