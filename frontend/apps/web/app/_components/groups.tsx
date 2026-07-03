"use client";

import type { GroupSession, GroupSessionMember } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import { useState, type ReactNode } from "react";

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

/** Builds the shareable invite link. Prefers the backend-supplied absolute URL
 * (`<frontend>/q/<token>`, origin-aware). When it's absent (e.g. the session was
 * serialized without a request context) it derives a real, working link from the
 * current origin rather than a fabricated short link — the invite code IS the
 * `/q/<token>` deep-link token, so `${origin}/q/<code>` resolves the same way. */
export function inviteUrl(code: string, url?: string): string {
  if (url && url.length > 0) return url;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/q/${code}`;
}

// Platform share icons. Brand marks (single-path, currentColor) so each row reads
// as the destination it opens instead of a generic share glyph. Sized to the row.
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="#25D366" aria-hidden focusable="false">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.8c2.16 0 4.19.84 5.72 2.37a8.06 8.06 0 0 1 2.37 5.72c0 4.48-3.64 8.11-8.11 8.11a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.12.82.83-3.04-.19-.31a8.02 8.02 0 0 1-1.23-4.28c0-4.47 3.64-8.11 8.11-8.11Zm-2.72 3.9c-.14 0-.36.05-.55.26-.19.2-.72.7-.72 1.72s.74 2 .84 2.14c.1.14 1.45 2.22 3.53 3.11.49.21.88.34 1.18.44.5.16.95.14 1.31.08.4-.06 1.23-.5 1.4-.99.18-.48.18-.9.13-.99-.05-.09-.19-.14-.4-.24-.21-.11-1.23-.61-1.42-.68-.19-.07-.33-.1-.47.1-.14.21-.54.68-.66.82-.12.14-.24.16-.45.05-.21-.1-.88-.32-1.68-1.03-.62-.55-1.04-1.24-1.16-1.45-.12-.2-.01-.31.09-.42.09-.09.21-.24.31-.36.1-.12.14-.2.21-.34.07-.14.03-.26-.02-.36-.05-.1-.46-1.12-.64-1.53-.17-.4-.34-.35-.47-.35Z" />
    </svg>
  );
}
function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="#229ED9" aria-hidden focusable="false">
      <path d="M21.94 4.9 18.7 19.4c-.24 1.08-.9 1.34-1.82.84l-5.02-3.7-2.42 2.33c-.27.27-.5.5-1 .5l.36-5.05 9.2-8.3c.4-.36-.09-.56-.62-.2L5.9 12.9l-4.9-1.53c-1.07-.33-1.1-1.07.22-1.58L20.55 3.4c.9-.33 1.68.2 1.39 1.5Z" />
    </svg>
  );
}
function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#C13584" strokeWidth={2} aria-hidden focusable="false">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="#C13584" stroke="none" />
    </svg>
  );
}

/** One full-width share row (icon + label) that either links out (platform intent)
 * or runs a handler (e.g. copy-and-open). */
export function ShareRow({
  label,
  icon,
  href,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const cls =
    "flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 text-[14px] font-semibold text-ink transition active:scale-[.99]";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        <span className="flex-none">{icon}</span>
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <span className="flex-none">{icon}</span>
      {label}
    </button>
  );
}

/**
 * Shared invite panel: the editable pre-written message, the dynamic invite link
 * with copy, and the platform share rows. Rendered inside the invite Sheet and the
 * standalone /invite page so both stay in sync (the message text, link, and share
 * intents live in one place). Callers supply their own heading + footer CTA.
 */
export function GroupInvitePanel({
  session,
  rewardTitle,
}: {
  session: GroupSession;
  rewardTitle: string;
}) {
  const t = useT();
  const { copied, copy } = useCopy();

  const remaining = Math.max(0, session.required_size - session.joined_count);
  const link = inviteUrl(session.invite_code, session.invite_url);

  // Pre-written message seeds an editable field — the user can tailor it before
  // sharing, and every share intent below reads the edited value.
  const defaultMessage = t("cmp.invite.message")
    .replace("{business}", session.business_name)
    .replace("{count}", String(remaining))
    .replace("{reward}", rewardTitle)
    .replace("{time}", hhmm(session.visit_time));
  const [message, setMessage] = useState(defaultMessage);

  const shareText = `${message} ${link}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const tgHref = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`;

  return (
    <>
      {/* editable pre-written message */}
      <label
        htmlFor="invite-message"
        className="mt-5 block text-[11px] font-bold uppercase tracking-[0.08em] text-subtle"
      >
        {t("cmp.invite.prewritten")}
      </label>
      <textarea
        id="invite-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        className="mt-2 w-full resize-none rounded-2xl border border-line bg-card p-4 text-[14px] leading-relaxed text-ink outline-none focus:border-brand"
      />

      {/* dynamic invite link + copy */}
      <div className="mt-3.5 flex items-center gap-2.5 rounded-2xl border border-dashed border-line bg-cream px-4 py-3.5">
        <span aria-hidden>🔗</span>
        <span className="flex-1 truncate font-mono text-[13px] font-semibold text-subtle">{link}</span>
        <button
          onClick={() => copy(link)}
          className="flex-none rounded-lg bg-brand-muted px-3 py-1.5 text-xs font-bold text-brand"
        >
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>

      {/* share rows */}
      <div className="mt-4 flex flex-col gap-2.5">
        <ShareRow label={t("cmp.invite.whatsapp")} icon={<WhatsAppIcon />} href={waHref} />
        <ShareRow label={t("cmp.invite.telegram")} icon={<TelegramIcon />} href={tgHref} />
        {/* Instagram has no web share-with-text intent — copy the message and open IG. */}
        <ShareRow
          label={t("cmp.invite.instagram")}
          icon={<InstagramIcon />}
          onClick={() => {
            copy(shareText);
            window.open("https://instagram.com", "_blank", "noopener,noreferrer");
          }}
        />
      </div>
    </>
  );
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
