"use client";

// Per-day opening-hours editor. Writes the canonical working_hours shape the rest
// of the app already understands: { mon: ["09:00","21:00"], … } — open days only.
// This is what powers isOpenNow()/renderHours() on the customer side, so the old
// free-text { display } is dropped in favour of real structured hours.

import { useT } from "@jaqyn/i18n";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type Week = Record<DayKey, [string, string] | null>; // null = closed

// Default a freshly-opened day to a common 09:00–21:00.
const DEFAULT_SPAN: [string, string] = ["09:00", "21:00"];

// Read stored working_hours into a full week WITHOUT inventing defaults — absent
// or non-array (legacy { display }) days come back closed.
export function readWeek(raw: unknown): Week {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const week = {} as Week;
  for (const d of DAY_KEYS) {
    const v = src[d];
    week[d] = Array.isArray(v) && v.length === 2 ? [String(v[0]), String(v[1])] : null;
  }
  return week;
}

// Editor's starting state: use stored hours if any day is set, otherwise seed a
// sensible weekdays-open template the owner can tweak.
export function initialWeek(raw: unknown): Week {
  const week = readWeek(raw);
  if (DAY_KEYS.some((d) => week[d])) return week;
  for (const d of DAY_KEYS) week[d] = d === "sat" || d === "sun" ? null : [...DEFAULT_SPAN];
  return week;
}

// Strip closed days → the object stored on the business.
export function weekToPayload(week: Week): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (const d of DAY_KEYS) {
    const v = week[d];
    if (v) out[d] = v;
  }
  return out;
}

// Human summary, grouping consecutive identical days: "Mon–Fri 09:00–21:00, Sat 10:00–16:00".
export function formatWeek(raw: unknown, label: (d: DayKey) => string): string {
  const week = readWeek(raw);
  const segments: string[] = [];
  let i = 0;
  while (i < DAY_KEYS.length) {
    const span = week[DAY_KEYS[i]!];
    if (!span) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < DAY_KEYS.length) {
      const next = week[DAY_KEYS[j + 1]!];
      if (!next || next[0] !== span[0] || next[1] !== span[1]) break;
      j++;
    }
    const days = i === j ? label(DAY_KEYS[i]!) : `${label(DAY_KEYS[i]!)}–${label(DAY_KEYS[j]!)}`;
    segments.push(`${days} ${span[0]}–${span[1]}`);
    i = j + 1;
  }
  return segments.join(", ");
}

const TIME =
  "rounded-lg border-[1.5px] border-line bg-card px-2 py-1 text-[13px] font-semibold text-ink outline-none focus:border-brand";

export function WeekHoursEditor({ value, onChange }: { value: Week; onChange: (week: Week) => void }) {
  const t = useT();

  function setDay(d: DayKey, span: [string, string] | null) {
    onChange({ ...value, [d]: span });
  }
  function copyToAll() {
    // Copy the first open day's span to every other open day.
    const first = DAY_KEYS.map((d) => value[d]).find(Boolean);
    if (!first) return;
    const next = { ...value };
    for (const d of DAY_KEYS) if (next[d]) next[d] = [...first];
    onChange(next);
  }

  return (
    <div className="mt-1.5 divide-y divide-line rounded-xl border border-line bg-card px-3">
      {DAY_KEYS.map((d) => {
        const span = value[d];
        const open = !!span;
        return (
          <div key={d} className="flex items-center gap-2.5 py-2">
            <span className="w-8 flex-none text-[12.5px] font-bold text-ink">{t(`owner.settings.day.${d}`)}</span>
            <button
              type="button"
              role="switch"
              aria-checked={open}
              aria-label={t(`owner.settings.day.${d}`)}
              onClick={() => setDay(d, open ? null : [...DEFAULT_SPAN])}
              className={`relative h-5 w-9 flex-none rounded-pill transition ${open ? "bg-brand" : "bg-handle"}`}
            >
              <span className={`absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-all ${open ? "left-[19px]" : "left-[3px]"}`} />
            </button>
            {open ? (
              <div className="ml-auto flex items-center gap-1.5">
                <input type="time" value={span[0]} onChange={(e) => setDay(d, [e.target.value, span[1]])} className={TIME} />
                <span className="text-xs text-subtle">–</span>
                <input type="time" value={span[1]} onChange={(e) => setDay(d, [span[0], e.target.value])} className={TIME} />
              </div>
            ) : (
              <span className="ml-auto text-[12.5px] font-semibold text-subtle">{t("owner.settings.hours.closed")}</span>
            )}
          </div>
        );
      })}
      <div className="py-2">
        <button type="button" onClick={copyToAll} className="text-xs font-bold text-brand transition hover:text-brand-deep">
          {t("owner.settings.hours.copyAll")}
        </button>
      </div>
    </div>
  );
}
