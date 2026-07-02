"use client";

// Emoji icon picker — a tile showing the current glyph that opens a small grid of
// curated business icons. Replaces the free-text emoji field so owners pick
// instead of typing. No dependency: a fixed emoji set is plenty here.

import { useEffect, useRef, useState } from "react";
import { useT } from "@jaqyn/i18n";

// Curated glyphs across the business categories (cafe/food/bakery/barber/beauty/
// retail/other). Extend the array if a category needs more.
const ICONS = [
  "☕", "🍵", "🧋", "🍽️", "🍔", "🍕",
  "🍜", "🥗", "🥐", "🍰", "🧁", "🍩",
  "🍦", "🍷", "🍺", "💈", "💇", "💅",
  "💆", "🛍️", "🏬", "🎁", "📚", "🌸",
];

export function IconPicker({ value, onChange }: { value: string; onChange: (glyph: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("owner.profile.icon")}
        className="flex h-14 w-14 items-center justify-center rounded-xl border-[1.5px] border-line bg-card text-2xl transition hover:border-brand"
      >
        {value || "☕"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 grid w-max max-w-[min(90vw,260px)] grid-cols-6 gap-1 rounded-xl border border-line bg-card p-2 shadow-card">
          {ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => {
                onChange(icon);
                setOpen(false);
              }}
              aria-pressed={value === icon}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-xl transition hover:bg-brand-muted ${value === icon ? "bg-brand-muted ring-1 ring-brand" : ""}`}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
