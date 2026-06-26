"use client";

// Customer campaigns feed (campaigns-restructure design §6). One feed:
// "From places you go" (feed.followed = in-progress) horizontal swipe row +
// "Discover more" (feed.discover) with filter chips (All/Group/Neighborhood/Ended)
// over the merged list. Cards route into the EXISTING detail/group screens.

import { useCampaignFeed } from "@jaqyn/api";
import type { CampaignFeedFilter } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import { useState } from "react";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { CampaignCard, CampaignCarouselCard } from "../_components/campaigns";
import { PageTitle } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";

// Discover chips map onto the backend feed `discover` filter (design §6).
const FILTER_ORDER: CampaignFeedFilter[] = ["all", "group", "neighborhood", "ended"];
const FILTER_LABEL_KEY: Record<CampaignFeedFilter, string> = {
  all: "cmp.feed.chip.all",
  group: "cmp.feed.chip.group",
  neighborhood: "cmp.feed.chip.neighborhood",
  ended: "cmp.feed.chip.ended",
};

export default function CampaignsFeedPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  const [filter, setFilter] = useState<CampaignFeedFilter>("all");
  const feed = useCampaignFeed(filter);

  return (
    <CustomerShell title={t("campaigns.title")} hideChromeTitle>
      {!isAuthenticated ? null : (
        <>
          <PageTitle>{t("campaigns.title")}</PageTitle>
          <p className="mt-1 text-[13.5px] text-subtle">{t("cmp.discover.subtitle")}</p>

          <QueryBoundary query={feed}>
            {(data) => (
              <>
                {data.followed.length > 0 && (
                  <section className="mt-6">
                    <h2 className="font-display text-lg font-bold text-ink">{t("cmp.feed.followed")}</h2>
                    <div className="-mx-5 mt-3 flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {data.followed.map((c) => (
                        <div key={c.id} className="snap-start">
                          <CampaignCarouselCard campaign={c} />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="mt-7">
                  <h2 className="font-display text-lg font-bold text-ink">{t("cmp.feed.discover")}</h2>
                  <div
                    className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    role="tablist"
                    aria-label={t("cmp.feed.discover")}
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

                  {data.discover.length === 0 ? (
                    <p className="mt-4 text-sm text-subtle">{t("cmp.feed.empty")}</p>
                  ) : (
                    <div className="mt-4 flex flex-col gap-3.5">
                      {data.discover.map((c) => (
                        <CampaignCard key={c.id} campaign={c} />
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </QueryBoundary>
        </>
      )}
    </CustomerShell>
  );
}
