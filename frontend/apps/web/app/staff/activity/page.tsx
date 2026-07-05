"use client";

import { useRecentActivity, useStaffStats } from "@jaqyn/api";
import type { ActivityEventKind } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Card } from "@jaqyn/ui";
import Link from "next/link";
import { useState } from "react";
import { StaffShell } from "../_components/StaffShell";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { useStaffAuth } from "../_lib/staffAuth";

/** Today's counter tile — same pattern as profile page. */
function StatTile({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-card">
      <div className="text-[12.5px] font-semibold text-subtle">{label}</div>
      <div className="mt-2 font-display text-[28px] font-extrabold leading-none text-ink">
        {value ?? "—"}
      </div>
    </div>
  );
}

// Map kind → emoji icon for the icon tile.
const KIND_ICON: Record<ActivityEventKind, string> = {
  redeem: "🎁",
  stamp: "☕",
  visit: "📍",
  points: "⭐",
  social: "📢",
};

function fmtRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}с`;
  if (diff < 3600) return `${Math.floor(diff / 60)}м`;
  return `${Math.floor(diff / 3600)}ч`;
}

// Filter chip spec: All → no kind param; others map directly.
type FilterKey = "all" | ActivityEventKind;

const FILTER_CHIPS: FilterKey[] = ["all", "redeem", "stamp", "visit", "points", "social"];

export default function StaffActivityPage() {
  const t = useT();
  const { isStaff, ready } = useStaffAuth();
  const [filter, setFilter] = useState<FilterKey>("all");
  const stats = useStaffStats(ready && isStaff);
  const kind = filter === "all" ? undefined : filter;
  const activity = useRecentActivity(ready && isStaff, kind);

  return (
    <StaffShell title={t("staff.activity.title")}>
      {!ready ? null : !isStaff ? (
        <Card>
          <p className="text-sm text-subtle">{t("staff.login")}</p>
          <Link href="/staff/login" className="mt-3 block">
            <Button className="w-full">{t("staff.signIn")}</Button>
          </Link>
        </Card>
      ) : (
        <div className="flex animate-[jqIn_.3s_ease] flex-col gap-5">
          {/* ── Today's stats ── */}
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label={t("staff.profile.scansToday")}
              value={stats.data?.scans_today}
            />
            <StatTile
              label={t("staff.profile.redemptionsToday")}
              value={stats.data?.redemptions_today}
            />
          </div>

          {/* ── Filter chips ── */}
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {FILTER_CHIPS.map((chip) => {
              const active = filter === chip;
              return (
                <button
                  key={chip}
                  onClick={() => setFilter(chip)}
                  className={[
                    "flex-none rounded-pill px-4 py-2 text-[13px] font-bold transition",
                    active
                      ? "bg-brand text-white"
                      : "border border-line bg-card text-subtle",
                  ].join(" ")}
                >
                  {t(`staff.activity.filter.${chip}`)}
                </button>
              );
            })}
          </div>

          {/* ── Event list ── */}
          <QueryBoundary query={activity}>
            {(data) => {
              const events = data.results;

              if (events.length === 0) {
                return (
                  <p className="py-6 text-center text-sm text-subtle">
                    {filter === "all"
                      ? t("staff.activity.emptyTitle")
                      : t("staff.activity.emptyFilter")}
                  </p>
                );
              }

              return (
                <div>
                  {/* RECENT label — design-system Label style */}
                  <p className="mb-3 text-[12.5px] font-bold uppercase tracking-[.04em] text-subtle">
                    {t("staff.activity.recent")}
                  </p>
                  <div className="flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
                    {events.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between gap-3 bg-card px-4 py-3.5"
                      >
                        {/* Icon tile */}
                        <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[14px] bg-board text-[20px]">
                          {KIND_ICON[event.kind]}
                        </div>

                        {/* Text */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">
                            {event.customer}
                          </p>
                          <p className="truncate text-[12.5px] text-subtle">
                            {event.label || t(`staff.activity.kind.${event.kind}`)}
                          </p>
                        </div>

                        {/* Time */}
                        <span className="flex-none text-xs text-subtle">
                          {fmtRelative(event.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
          </QueryBoundary>
        </div>
      )}
    </StaffShell>
  );
}
