"use client";

import { useNearby, type Business } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge } from "@jaqyn/ui";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CustomerShell } from "../_components/CustomerShell";
import { MiniMap } from "../_components/MiniMap";
import { QueryBoundary } from "../_components/QueryBoundary";
import { FilterChips, InitialTile } from "../_components/kit";
import { isOpenNow } from "../_lib/hours";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "cafe", label: "Cafe" },
  { key: "restaurant", label: "Restaurant" },
  { key: "bakery", label: "Bakery" },
  { key: "barber", label: "Barber" },
  { key: "beauty", label: "Beauty" },
  { key: "retail", label: "Retail" },
  { key: "other", label: "Other" },
] as const;
type CatKey = (typeof CATEGORIES)[number]["key"];

export default function NearbyPage() {
  const t = useT();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<CatKey>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const askedForLocation = useRef(false);
  const nearby = useNearby({
    search: search.trim() || undefined,
    category: cat === "all" ? undefined : cat,
    lat: loc?.lat,
    lng: loc?.lng,
    radius_km: loc ? 25 : undefined,
    limit: 6,
  });

  const cats = useMemo(
    () => CATEGORIES.map((c) => ({ key: c.key, label: c.key === "all" ? t("nearby.all") : c.label })),
    [t],
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

  return (
    <CustomerShell title={t("nearby.title")}>
      <div className="mb-3 flex items-center gap-2 rounded-xl border-[1.5px] border-line bg-card px-3.5">
        <span className="text-subtle" aria-hidden>🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("nearby.search")}
          className="flex-1 bg-transparent py-3 text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-subtle"
        />
      </div>
      <FilterChips options={cats} value={cat} onChange={setCat} />
      {locMsg && <div className="mt-2 text-xs font-semibold text-subtle">{locMsg}</div>}

      <QueryBoundary query={nearby} isEmpty={(b) => b.length === 0} emptyMessage={t("nearby.empty")}>
        {(list) => {
          const shown = list;
          const active = selected ?? shown[0]?.id ?? null;
          return (
            <>
              <MiniMap
                selectedId={active}
                onSelect={setSelected}
                userLocation={loc}
                onUseLocation={requestLocation}
                pins={shown.map((b, i) => ({
                  id: b.id,
                  initial: b.glyph || b.name.charAt(0).toUpperCase(),
                  name: b.name,
                  dist: b.distance_km != null ? `${b.distance_km} ${t("nearby.distance")}` : undefined,
                  closest: i === 0,
                  lat: toNum(b.latitude),
                  lng: toNum(b.longitude),
                  accent: b.accent_color,
                }))}
              />

              <h2 className="mt-5 font-display text-base font-bold text-ink">{t("nearby.closestTo")}</h2>
              <div className="mt-3 flex flex-col gap-3">
                {shown.map((b, i) => (
                  <NearbyCard
                    key={b.id}
                    business={b}
                    nearest={i === 0}
                    selected={active === b.id}
                    onFocus={() => setSelected(b.id)}
                  />
                ))}
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </CustomerShell>
  );
}

function NearbyCard({
  business: b,
  nearest,
  selected,
  onFocus,
}: {
  business: Business;
  nearest: boolean;
  selected: boolean;
  onFocus: () => void;
}) {
  const t = useT();
  const open = isOpenNow(b.working_hours);
  return (
    <Link
      href={`/nearby/${b.id}`}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      className={`flex items-center gap-3 rounded-[14px] border bg-card px-3.5 py-3 shadow-card transition active:scale-[.99] ${selected ? "border-brand" : "border-line"}`}
    >
      <InitialTile name={b.glyph || b.name} size={42} />
      <div className="min-w-0 flex-1">
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
    </Link>
  );
}

function toNum(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
