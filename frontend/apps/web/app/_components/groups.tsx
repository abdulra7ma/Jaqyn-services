"use client";

import type { GroupMember, GroupOffer } from "@jaqyn/api";
import { useState, type ReactNode } from "react";

/** Emoji used on the deal cover — reward type wins, then business category. */
export function dealEmoji(offer: Pick<GroupOffer, "reward_type" | "business">): string {
  if (offer.reward_type === "free_shared_item") return "🍰";
  switch (offer.business.category) {
    case "cafe":
      return "☕";
    case "bakery":
      return "🥐";
    case "restaurant":
      return "🍽️";
    case "barber":
      return "💈";
    case "beauty":
      return "💅";
    case "retail":
      return "🛍️";
    default:
      return "🎁";
  }
}

/** Diagonal-striped cover with a centered emoji and overlaid badges (matches the design canvas). */
export function OfferCover({
  emoji,
  topLeft,
  topRight,
  className = "",
}: {
  emoji: string;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-board/50 ${className}`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(255,255,255,.45) 0 14px, transparent 14px 28px)",
      }}
    >
      <span className="text-[44px] drop-shadow-sm sm:text-[52px]">{emoji}</span>
      {topLeft && <div className="absolute left-3 top-3">{topLeft}</div>}
      {topRight && <div className="absolute right-3 top-3">{topRight}</div>}
    </div>
  );
}

/** Small white pill used for tags on the cover. */
export function CoverTag({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "amber" }) {
  return (
    <span
      className={`rounded-pill bg-card px-2.5 py-1 text-[11px] font-bold shadow-card ${
        tone === "amber" ? "text-amber-deep" : "text-ink"
      }`}
    >
      {children}
    </span>
  );
}

/** Member avatar circles + empty (dashed) slots, sized to the offer's minimum. */
export function AvatarSlots({
  members,
  size,
  variant = "light",
}: {
  members: GroupMember[];
  size: number;
  variant?: "light" | "onBrand";
}) {
  const slots = Math.max(size, members.length);
  const empties = Math.max(0, slots - members.length);
  const ring = variant === "onBrand" ? "border-white/45 text-white/70" : "border-line text-subtle";
  const filled =
    variant === "onBrand" ? "bg-white/20 text-white" : "bg-brand-muted text-brand";
  return (
    <div className="flex flex-wrap gap-2.5">
      {members.map((m) => (
        <div
          key={m.id}
          title={m.name}
          className={`flex h-12 w-12 items-center justify-center rounded-full font-display text-base font-bold ${filled}`}
        >
          {m.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {Array.from({ length: empties }).map((_, i) => (
        <div
          key={i}
          className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed text-xl ${ring}`}
        >
          +
        </div>
      ))}
    </div>
  );
}

/** Visit-time slots ("15:00".."18:00" → 30-min steps), capped for a tidy grid. */
export function timeSlots(start: string, end: string, max = 4): string[] {
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const out: string[] = [];
  for (let t = toMin(start); t <= toMin(end) - 60 && out.length < max; t += 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out.length ? out : [start];
}

/** "HH:MM" today → ISO string for the createGroup payload. */
export function slotToIso(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

/** Copy-to-clipboard with a transient "copied" flag. */
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

export function inviteUrl(token: string): string {
  if (typeof window !== "undefined") return `${window.location.origin}/groups/${token}`;
  return `/groups/${token}`;
}

/** Short display form of an invite link, e.g. "jaqyn.kg/g/mana-6047". */
export function inviteShort(token: string): string {
  return `jaqyn.kg/g/${token.replace(/[^a-z0-9]/gi, "").slice(-8)}`;
}
