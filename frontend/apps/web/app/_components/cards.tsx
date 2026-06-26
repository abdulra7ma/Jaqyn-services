"use client";

import type { Business } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { InitialTile } from "./kit";

export function BusinessCard({ business }: { business: Business }) {
  const t = useT();
  return (
    <Link
      href={`/nearby/${business.id}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-card transition active:scale-[.99]"
    >
      <InitialTile name={business.name} image={business.logo_url} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-ink">{business.name}</p>
        <p className="truncate text-xs text-subtle">{business.area} · {business.address}</p>
      </div>
      {business.distance_km != null && (
        <span className="shrink-0 text-xs font-semibold text-subtle">
          {business.distance_km} {t("nearby.distance")}
        </span>
      )}
    </Link>
  );
}
