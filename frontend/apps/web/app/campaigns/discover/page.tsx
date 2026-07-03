"use client";

/**
 * /campaigns/discover — search + category filter + featured/trending/fresh sections.
 *
 * Search is debounced (300ms) and passed as `q` param to the feed hook.
 * Category chips pass as `category` param.
 * Groups chip maps onto the feed `filter="group"` axis (campaign_type, not category).
 *
 * Sections (featured/trending/fresh) come from feed.sections and are shown when no
 * active search or category filter is applied.
 */

import { useCampaignFeed, type CampaignFeedFilter } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import { useCallback, useState } from "react";
import { CustomerShell } from "../../_components/CustomerShell";
import { CampaignCard, DiscoverRow } from "../../_components/campaigns";
import { useRequireAuth } from "../../_lib/auth";
import { useDebounce } from "../../_lib/useDebounce";
import { useUserLocation } from "../../_lib/useUserLocation";

// Category chips. "groups" maps to a feed filter, not a category slug.
const CHIPS = [
  { key: "all", label: "cmp.discover.chip.all", category: undefined, filter: undefined },
  { key: "coffee", label: "cmp.discover.chip.coffee", category: "cafe", filter: undefined },
  { key: "food", label: "cmp.discover.chip.food", category: "restaurant", filter: undefined },
  { key: "services", label: "cmp.discover.chip.services", category: "barber", filter: undefined },
  { key: "groups", label: "cmp.discover.chip.groups", category: undefined, filter: "group" as CampaignFeedFilter },
] as const;

type ChipKey = (typeof CHIPS)[number]["key"];

// Debounce delay for search input — avoids a request on each keystroke.
const SEARCH_DEBOUNCE_MS = 300;

export default function DiscoverPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  const userLoc = useUserLocation();

  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<ChipKey>("all");

  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS);

  const activeChip = CHIPS.find((c) => c.key === chip) ?? CHIPS[0];
  const feedFilter = activeChip.filter;
  const categoryParam = activeChip.category;

  const feedQuery = useCampaignFeed(
    feedFilter,
    {
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      ...(categoryParam ? { category: categoryParam } : {}),
    },
  );

  const feed = feedQuery.data;
  const hasActiveFilter = !!debouncedSearch || chip !== "all";

  const handleChipClick = useCallback((key: ChipKey) => {
    setChip(key);
  }, []);

  if (!isAuthenticated) return null;

  return (
    <CustomerShell title={t("cmp.discover.page.title")} hideChromeTitle>
      <div className="flex flex-col gap-5 pb-8">
        {/* Header */}
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
            {t("cmp.discover.page.subtitle")}
          </p>
          <h1 className="mt-0.5 font-display text-2xl font-bold text-ink">
            {t("cmp.discover.page.title")}
          </h1>
        </header>

        {/* Search input */}
        <div className="relative">
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
            aria-hidden
          >
            🔍
          </span>
          <input
            type="search"
            placeholder={t("cmp.discover.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-line bg-cream py-3 pl-10 pr-4 text-[14px] text-ink placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            aria-label={t("cmp.discover.search")}
          />
        </div>

        {/* Category chips */}
        <div
          className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={t("cmp.discover.page.title")}
        >
          {CHIPS.map((c) => {
            const selected = chip === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => handleChipClick(c.key)}
                className={cn(
                  "flex-none rounded-pill border px-4 py-1.5 text-[13px] font-semibold transition whitespace-nowrap",
                  selected
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-line bg-card text-subtle active:scale-[.98]",
                )}
              >
                {t(c.label)}
              </button>
            );
          })}
        </div>

        {/* Loading state */}
        {feedQuery.isLoading && (
          <p className="text-center text-[13.5px] text-subtle">{t("common.loading")}</p>
        )}

        {/* Sections — shown only when no active filter/search */}
        {!hasActiveFilter && feed?.sections && (
          <>
            {feed.sections.featured.length > 0 && (
              <section>
                <h2 className="font-display text-[17px] font-bold text-ink">{t("cmp.discover.featured")}</h2>
                <div className="mt-3 flex flex-col gap-3">
                  {feed.sections.featured.map((c) => (
                    <CampaignCard key={c.id} campaign={c} />
                  ))}
                </div>
              </section>
            )}

            {feed.sections.trending.length > 0 && (
              <section>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-[17px] font-bold text-ink">{t("cmp.discover.trending")}</h2>
                  {/* "Open" status pill — sage dot + 11/700, padding 4×10 (design spec). */}
                  <span className="inline-flex items-center gap-[5px] rounded-pill bg-sage-soft px-2.5 py-1 text-[11px] font-bold text-ok">
                    <span className="h-1.5 w-1.5 rounded-full bg-sage-deep" aria-hidden />
                    {t("cmp.discover.trending.open")}
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-[11px]">
                  {feed.sections.trending.map((c) => (
                    <DiscoverRow key={c.id} campaign={c} userLoc={userLoc} />
                  ))}
                </div>
              </section>
            )}

            {feed.sections.fresh.length > 0 && (
              <section>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-[17px] font-bold text-ink">{t("cmp.discover.fresh")}</h2>
                  {/* "Fresh" status pill — amber dot + 11/700, padding 4×10 (design spec). */}
                  <span className="inline-flex items-center gap-[5px] rounded-pill bg-brand-muted px-2.5 py-1 text-[11px] font-bold text-amber-deep">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden />
                    {t("cmp.discover.fresh.pill")}
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-[11px]">
                  {feed.sections.fresh.map((c) => (
                    <DiscoverRow key={c.id} campaign={c} userLoc={userLoc} />
                  ))}
                </div>
              </section>
            )}

            {/* Empty sections */}
            {feed.sections.featured.length === 0 &&
              feed.sections.trending.length === 0 &&
              feed.sections.fresh.length === 0 &&
              feed.discover.length === 0 && (
                <p className="text-center text-[13.5px] text-subtle">{t("cmp.discover.empty")}</p>
              )}
          </>
        )}

        {/* Filtered results (search or category chip active) */}
        {hasActiveFilter && feed && (
          <section>
            {feed.discover.length === 0 ? (
              <p className="text-center text-[13.5px] text-subtle">{t("cmp.discover.empty")}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {feed.discover.map((c) => (
                  <CampaignCard key={c.id} campaign={c} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </CustomerShell>
  );
}
