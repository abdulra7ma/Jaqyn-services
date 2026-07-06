"use client";

import type { LoyaltyTier } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";

/** Owner-editable draft of one ladder rung — free-text fields so partial input
 * never fights the keyboard; `draftsToTiers` validates on submit. */
export type TierDraft = { name: string; visits: string; percent: string };

/** Seed ladder for the create wizard: 3 rungs mirroring the common
 * Bronze→Silver→Gold shape so owners edit instead of inventing a structure. */
export const DEFAULT_TIER_DRAFTS: TierDraft[] = [
  { name: "", visits: "0", percent: "3" },
  { name: "", visits: "5", percent: "5" },
  { name: "", visits: "10", percent: "8" },
];

export function tiersToDrafts(tiers: LoyaltyTier[]): TierDraft[] {
  return tiers.map((tier) => ({
    name: tier.name,
    visits: String(tier.min_visits),
    percent: String(Number(tier.cashback_percent)),
  }));
}

/**
 * Validate drafts into API rungs, or null when the ladder is invalid.
 * Mirrors the backend rules so owners get feedback before submitting: every
 * rung named, the first at 0 visits, thresholds strictly increasing, unique
 * names, cashback in (0, 100].
 */
export function draftsToTiers(rows: TierDraft[]): LoyaltyTier[] | null {
  if (rows.length === 0) return null;
  const names = new Set<string>();
  let previousVisits = -1;
  const tiers: LoyaltyTier[] = [];
  for (const [i, row] of rows.entries()) {
    const name = row.name.trim();
    const visits = Number(row.visits);
    const percent = Number(row.percent);
    if (!name || names.has(name.toLowerCase())) return null;
    names.add(name.toLowerCase());
    if (!Number.isInteger(visits) || visits < 0) return null;
    if (i === 0 && visits !== 0) return null;
    if (visits <= previousVisits) return null;
    previousVisits = visits;
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return null;
    tiers.push({ name, min_visits: visits, cashback_percent: String(percent) });
  }
  return tiers;
}

const LABEL = "text-[12px] font-bold text-subtle";
const FIELD =
  "mt-1.5 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-brand";

// Backend MAX_TIERS (loyalty program service) — keep the editor from building
// a ladder the API will reject.
const MAX_TIERS = 6;

/**
 * Status-ladder editor: one row per rung (status name · from-visit · cashback %)
 * plus add/remove controls. Pure controlled component — owns no state.
 */
export function TierEditor({
  rows,
  onChange,
}: {
  rows: TierDraft[];
  onChange: (rows: TierDraft[]) => void;
}) {
  const t = useT();

  function setRow(index: number, patch: Partial<TierDraft>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, i) => (
        <div key={i} className="rounded-2xl border border-line bg-cream/40 p-3.5">
          <div className="flex gap-3">
            <label className="block flex-[2]">
              <span className={LABEL}>{t("loyalty.biz.tiers.name")}</span>
              <input
                value={row.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
                placeholder={t("loyalty.biz.tiers.namePh")}
                className={FIELD}
              />
            </label>
            <label className="block flex-1">
              <span className={LABEL}>{t("loyalty.biz.tiers.fromVisits")}</span>
              <input
                value={row.visits}
                onChange={(e) => setRow(i, { visits: e.target.value })}
                inputMode="numeric"
                disabled={i === 0}
                className={`${FIELD} disabled:opacity-60`}
              />
            </label>
            <label className="block flex-1">
              <span className={LABEL}>{t("loyalty.biz.tiers.percent")}</span>
              <input
                value={row.percent}
                onChange={(e) => setRow(i, { percent: e.target.value })}
                inputMode="numeric"
                className={FIELD}
              />
            </label>
          </div>
          {i === 0 ? (
            <p className="mt-2 text-[12px] text-subtle">{t("loyalty.biz.tiers.firstHint")}</p>
          ) : (
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="mt-2 text-[12.5px] font-semibold text-danger"
            >
              {t("loyalty.biz.tiers.remove")}
            </button>
          )}
        </div>
      ))}
      {rows.length < MAX_TIERS && (
        <button
          type="button"
          onClick={() => {
            const last = rows[rows.length - 1];
            const nextVisits = last ? String((Number(last.visits) || 0) + 5) : "0";
            onChange([...rows, { name: "", visits: nextVisits, percent: last?.percent ?? "5" }]);
          }}
          className="rounded-xl border-[1.5px] border-dashed border-line bg-card py-3 text-[13.5px] font-bold text-brand transition active:scale-[.99]"
        >
          + {t("loyalty.biz.tiers.add")}
        </button>
      )}
    </div>
  );
}
