"use client";

import type { GroupSessionMember } from "@jaqyn/api";
import { cn } from "@jaqyn/ui";
import { useState } from "react";

/** Copy-to-clipboard with a transient "copied" flag. Used by the campaign group
 * flow's invite screen (the legacy group-deals helpers were removed with that
 * surface in the campaigns restructure). */
export function useCopy(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };
  return { copied, copy };
}

/** Builds the shareable invite link, preferring the backend-supplied full URL and
 * falling back to the canonical jaqyn.kg/g/<code> short link. */
export function inviteUrl(code: string, url?: string): string {
  return url && url.length > 0 ? url : `jaqyn.kg/g/${code}`;
}

/** Formats a Date (or ISO string) to a local 24h HH:MM, e.g. "14:30". */
export function hhmm(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Parses "HH:MM" into minutes-since-midnight; null when unparseable. */
function parseMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Default check-in window (minutes) when the campaign omits one. Matches the
// backend's group_checkin_window_minutes default referenced in the contract.
const DEFAULT_CHECKIN_WINDOW_MIN = 30;
// Slot granularity for the visit-time picker (minutes). 30-min steps per the spec.
const SLOT_STEP_MIN = 30;

/**
 * Builds today's selectable visit-time slots, every {SLOT_STEP_MIN} minutes from
 * the active window start up to (window end − check-in window). Returns Date
 * objects for TODAY. Falls back to a single start slot when the window is too
 * tight, so the picker is never empty for an active group campaign.
 */
export function buildVisitSlots(
  startTime: string,
  endTime: string,
  checkinWindowMin: number | null,
): Date[] {
  const start = parseMinutes(startTime);
  const end = parseMinutes(endTime);
  if (start == null || end == null) return [];
  const window = checkinWindowMin ?? DEFAULT_CHECKIN_WINDOW_MIN;
  const lastSlot = end - window;
  const slots: Date[] = [];
  for (let m = start; m <= lastSlot; m += SLOT_STEP_MIN) {
    const d = new Date();
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    slots.push(d);
  }
  // Window too tight to fit a full check-in: still offer the start slot.
  if (slots.length === 0) {
    const d = new Date();
    d.setHours(Math.floor(start / 60), start % 60, 0, 0);
    slots.push(d);
  }
  return slots;
}

/**
 * Row of group seats: one filled circle per joined member (leader shows their
 * initial) and dashed "+" circles for the remaining seats. Rendered on the
 * forming/full group screen above the "need N more" line.
 */
export function AvatarSlots({
  members,
  requiredSize,
}: {
  members: GroupSessionMember[];
  requiredSize: number;
}) {
  const joined = members.slice(0, requiredSize);
  const remaining = Math.max(0, requiredSize - joined.length);
  return (
    <div className="flex flex-wrap gap-2.5">
      {joined.map((m) => (
        <div
          key={m.id}
          className={cn(
            "flex h-11 w-11 flex-none items-center justify-center rounded-full font-display text-base font-bold",
            m.is_leader ? "bg-white text-brand" : "bg-white/85 text-brand",
          )}
          aria-hidden
        >
          {m.initial}
        </div>
      ))}
      {Array.from({ length: remaining }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 border-dashed border-white/55 text-lg font-bold text-white/70"
          aria-hidden
        >
          +
        </div>
      ))}
    </div>
  );
}
