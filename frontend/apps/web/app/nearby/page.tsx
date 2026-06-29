"use client";

import { useCategories, useNearby, type Business } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge, cn, Sheet } from "@jaqyn/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { BusinessSheet } from "../_components/BusinessSheet";
import { CustomerShell } from "../_components/CustomerShell";
import { MiniMap } from "../_components/MiniMap";
import { QueryBoundary } from "../_components/QueryBoundary";
import { InitialTile } from "../_components/kit";
import { isOpenNow } from "../_lib/hours";

// Sentinel for the "no category filter" chip; not a real Business.Category value.
const ALL_CATEGORY = "all";

// Emoji avatar per category chip. Keyed by Business.Category value (+ the local
// "all" sentinel). Falls back to a pin for any unknown/future category.
const CATEGORY_EMOJI: Record<string, string> = {
  all: "✦",
  cafe: "☕",
  restaurant: "🍽️",
  barber: "💈",
  beauty: "💅",
  retail: "🛍️",
  bakery: "🥐",
  other: "🏬",
};

export default function NearbyPage() {
  const t = useT();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>(ALL_CATEGORY);
  const [selected, setSelected] = useState<string | null>(null);
  // ID of business whose detail sheet is open. Separate from `selected` so
  // pin-highlight and detail-open are independent gestures.
  const [sheetId, setSheetId] = useState<string | null>(null);
  // The browsable list sheet — opened from the reward/results pill.
  const [listOpen, setListOpen] = useState(false);
  // Search field folded (just the 🔍 button) vs unfolded (full input). Chips
  // stay visible either way.
  const [searchOpen, setSearchOpen] = useState(false);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const askedForLocation = useRef(false);
  // Category options come from the backend (Business.Category) — never hardcoded here.
  const categoriesQuery = useCategories();
  const nearby = useNearby({
    search: search.trim() || undefined,
    category: cat === ALL_CATEGORY ? undefined : cat,
    lat: loc?.lat,
    lng: loc?.lng,
    radius_km: loc ? 25 : undefined,
    limit: 6,
  });

  // "All" chip is local (no backend value); the rest are the fetched categories.
  const cats = useMemo(
    () => [
      { key: ALL_CATEGORY, label: t("nearby.all") },
      ...(categoriesQuery.data ?? []).map((c) => ({ key: c.value, label: c.label })),
    ],
    [categoriesQuery.data, t],
  );

  useEffect(() => {
    if (askedForLocation.current) return;
    askedForLocation.current = true;
    requestLocation(true);
  }, []);

  function requestLocation(auto = false) {
    if (!navigator.geolocation) {
      setLocMsg("Location is not available in this browser.");
      return;
    }
    setLocMsg(auto ? "Allow location to center the map around you." : "Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocMsg("Map centered on your location");
      },
      () => setLocMsg("Location denied. Showing default nearby list."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  // The map renders best-effort from whatever has loaded; the list sheet owns the
  // proper loading / empty / error states via QueryBoundary.
  const list = nearby.data ?? [];
  const active = selected ?? list[0]?.id ?? null;
  // Reward pill counts nearby businesses currently offering a reward (🎁).
  const rewardCount = list.filter((b) => b.reward).length;

  function openDetail(id: string) {
    setSelected(id);
    // Opening a detail on top of the list sheet would stack two drawers; close
    // the list first so only one overlay is live at a time.
    setListOpen(false);
    setSheetId(id);
  }

  return (
    <CustomerShell title={t("nearby.title")} bleed hideChromeTitle>
      {/* full-bleed map canvas */}
      <div className="absolute inset-0">
        <MiniMap
          bare
          selectedId={active}
          onSelect={setSelected}
          onOpen={openDetail}
          userLocation={loc}
          onUseLocation={requestLocation}
          onMapClick={() => setListOpen(true)}
          pins={list.map((b, i) => ({
            id: b.id,
            initial: b.glyph || b.name.charAt(0).toUpperCase(),
            name: b.name,
            dist: b.distance_km != null ? `${b.distance_km} ${t("nearby.distance")}` : undefined,
            closest: i === 0,
            lat: toNum(b.latitude),
            lng: toNum(b.longitude),
            accent: b.accent_color,
            logoUrl: b.logo_url,
            category: b.category,
            reward: b.reward ?? undefined,
            open: isOpenNow(b.working_hours),
          }))}
        />
      </div>

      {/* floating top controls — search + category chips live on the map and
          filter it live (pins and the list both update). The reward pill opens
          the list to browse the matching cards; searching works without it. */}
      <div className="absolute inset-x-0 top-0 z-20 p-4 pt-[max(env(safe-area-inset-top),16px)]">
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <div className="flex flex-1 items-center gap-1 rounded-pill border-[1.5px] border-line bg-card pl-1.5 pr-3 shadow-card">
              {/* leading magnifier doubles as the close/fold toggle */}
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
                aria-label={t("common.close")}
                className="grid h-9 w-9 flex-none place-items-center rounded-full text-subtle transition active:scale-90"
              >
                🔍
              </button>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- opening search is an explicit user action
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("nearby.search")}
                className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-subtle"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label={t("common.close")}
                  className="flex-none text-subtle"
                >
                  ✕
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={t("nearby.search")}
              className="grid h-11 w-11 flex-none place-items-center rounded-full bg-card text-lg shadow-card transition active:scale-95"
            >
              🔍
            </button>
          )}

          {!searchOpen && list.length > 0 && (
            <button
              type="button"
              onClick={() => setListOpen(true)}
              aria-label={t("nearby.title")}
              className="ml-auto flex flex-none items-center gap-1.5 rounded-pill bg-card px-3.5 py-2.5 shadow-card transition active:scale-95"
            >
              {/* gift when any match offers a reward, else a pin; count is total
                  matches so the opener never disappears under a filter */}
              <span aria-hidden>{rewardCount > 0 ? "🎁" : "📍"}</span>
              <span className="text-sm font-bold text-ink">{list.length}</span>
            </button>
          )}
        </div>

        {!searchOpen && (
          <div className="mt-3">
            <CategoryChips options={cats} value={cat} onChange={setCat} />
          </div>
        )}

        {locMsg && !listOpen && (
          <div className="mt-3 w-fit rounded-pill bg-ink/80 px-3 py-1 text-xs font-semibold text-white shadow-card backdrop-blur">
            {locMsg}
          </div>
        )}
      </div>

      {/* browsable list — bottom sheet over the map (same modal sheet as the
          business detail; a non-modal/persistent drawer wouldn't animate open
          reliably here). Search + category chips live in the sheet header. */}
      {listOpen && (
        <Sheet
          open
          onOpenChange={(o) => {
            if (!o) setListOpen(false);
          }}
          variant="modal"
          surface="cream"
          padded={false}
          ariaLabel={t("nearby.title")}
        >
          <div className="px-4 pb-4">
            <h2 className="mb-3 font-display text-base font-bold text-ink">{t("nearby.closestTo")}</h2>
            <QueryBoundary query={nearby} isEmpty={(b) => b.length === 0} emptyMessage={t("nearby.empty")}>
              {(items) => (
                <div className="flex flex-col gap-3">
                  {items.map((b, i) => (
                    <NearbyCard
                      key={b.id}
                      business={b}
                      nearest={i === 0}
                      selected={active === b.id}
                      onFocus={() => setSelected(b.id)}
                      onOpen={() => openDetail(b.id)}
                    />
                  ))}
                </div>
              )}
            </QueryBoundary>
          </div>
        </Sheet>
      )}

      {sheetId && <BusinessSheet businessId={sheetId} onClose={() => setSheetId(null)} />}
    </CustomerShell>
  );
}

/** Horizontally-scrolling category filter — each chip is an emoji avatar + label;
 *  the active chip fills with the brand color (see CATEGORY_EMOJI). */
function CategoryChips({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {options.map((o) => {
        const active = value === o.key;
        const emoji = CATEGORY_EMOJI[o.key] ?? "📍";
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={cn(
              "flex flex-none items-center gap-2 rounded-pill py-1.5 pl-1.5 pr-4 text-sm font-bold shadow-card transition active:scale-95",
              active ? "bg-brand text-brand-fg" : "border border-line bg-card text-ink",
            )}
          >
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full text-base leading-none",
                active ? "bg-white/25 text-brand-fg" : "bg-[#F4ECDF] text-brand",
              )}
              aria-hidden
            >
              {emoji}
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function NearbyCard({
  business: b,
  nearest,
  selected,
  onFocus,
  onOpen,
}: {
  business: Business;
  nearest: boolean;
  selected: boolean;
  onFocus: () => void;
  onOpen: () => void;
}) {
  const t = useT();
  const open = isOpenNow(b.working_hours);
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      className={`flex w-full items-center gap-3 rounded-[14px] border bg-card px-3.5 py-3 shadow-card transition active:scale-[.99] ${selected ? "border-brand" : "border-line"}`}
    >
      <InitialTile name={b.glyph || b.name} size={42} image={b.logo_url} />
      <div className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-ink">{b.name}</span>
          {open !== null && (
            <Badge tone={open ? "ok" : "neutral"}>{open ? t("nearby.open") : t("nearby.closed")}</Badge>
          )}
          {nearest && <Badge tone="brand">{t("nearby.nearest")}</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-subtle">
          {b.category}
          {b.price_level ? ` · ${b.price_level}` : ""}
          {b.distance_km != null ? ` · ${b.distance_km} ${t("nearby.distance")}` : ""}
        </p>
        {b.reward && <p className="mt-1 text-xs font-semibold text-brand">{b.reward}</p>}
        {b.tags && b.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {b.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-pill bg-[#F4ECDF] px-2 py-0.5 text-[10.5px] font-semibold text-subtle">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="text-xl text-subtle" aria-hidden>›</span>
    </button>
  );
}

function toNum(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
