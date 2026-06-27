"use client";

import type { Campaign } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useRouter } from "next/navigation";

type Translate = ReturnType<typeof useT>;

/** "Valid" cell value: a day label + the active-hours window. Empty active_days
 * is treated as every day → "Daily". */
function validLabel(t: Translate, c: Campaign): string {
  const days = c.active_days?.trim() ? c.active_days : t("cmp.group.detail.daily");
  const hours = c.active_hours?.trim();
  return hours ? `${days}, ${hours}` : days;
}

/** Group-specific rule bullets shown on the offer detail (prototype SCREEN 2). */
function groupRuleLines(t: Translate): string[] {
  return [
    t("cmp.group.rule.everyone"),
    t("cmp.group.rule.window"),
    t("cmp.group.rule.onePerVisit"),
  ];
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3.5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-subtle">{label}</p>
      <p className="mt-1 font-display text-[15px] font-bold text-ink">{value}</p>
    </div>
  );
}

/**
 * Group offer detail (prototype SCREEN 2). Striped/peach hero with a reward-type
 * badge, business meta line, title + description, a 2x2 info grid (reward, group
 * size, valid window, min spend), group rules, and a sticky "Create Group" CTA
 * that routes into the group session flow.
 */
export function GroupCampaignDetail({ campaign: c }: { campaign: Campaign }) {
  const t = useT();
  const router = useRouter();

  const size = c.rule.required_group_size ?? 0;
  const minSpend = c.rule.min_spend;
  // Business meta line: name · category · area/address.
  const metaLine = [c.business.name, c.business.category, c.business.area || c.business.address]
    .filter((s) => s && String(s).length > 0)
    .join(" · ");

  return (
    <>
      {/* striped/peach hero with reward-type badge */}
      <div className="relative h-40 overflow-hidden rounded-3xl">
        {c.business.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.business.logo_url}
            alt=""
            className="h-full w-full object-cover"
            aria-hidden
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(135deg,#F4D9B8_0px,#F4D9B8_18px,#EFC99E_18px,#EFC99E_36px)]"
            aria-hidden
          >
            <span className="text-5xl opacity-80">👥</span>
          </div>
        )}
        <span className="absolute bottom-3 left-3 rounded-pill bg-white/90 px-3 py-1 text-xs font-bold text-brand shadow-card">
          {t(`cmp.biz.wiz.rewardType.${c.reward.type}`)}
        </span>
      </div>

      <p className="mt-4 text-[12.5px] text-subtle">{metaLine}</p>
      <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink">{c.name}</h1>
      {c.description && (
        <p className="mt-2.5 text-[14px] leading-relaxed text-ink">{c.description}</p>
      )}

      {/* 2x2 info grid */}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <InfoCell label={t("cmp.group.detail.reward")} value={c.reward.title} />
        <InfoCell
          label={t("cmp.group.detail.size")}
          value={t("cmp.group.detail.sizeValue").replace("{count}", String(size))}
        />
        <InfoCell label={t("cmp.group.detail.valid")} value={validLabel(t, c)} />
        <InfoCell
          label={t("cmp.group.detail.minSpend")}
          value={
            minSpend
              ? t("cmp.group.detail.minSpendValue").replace("{amount}", minSpend)
              : t("cmp.group.detail.noMinimum")
          }
        />
      </div>

      {/* rules */}
      <h2 className="mt-6 font-display text-[15px] font-bold text-ink">{t("cmp.detail.rules")}</h2>
      <ul className="mt-2.5 flex flex-col gap-2">
        {groupRuleLines(t).map((rule, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-subtle">
            <span className="font-bold text-brand" aria-hidden>
              ·
            </span>
            {rule}
          </li>
        ))}
      </ul>

      {/* sticky CTA */}
      <div className="sticky bottom-0 -mx-4 mt-6 bg-gradient-to-t from-cream from-[26%] to-transparent px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3.5 sm:-mx-6 sm:px-6">
        <button
          onClick={() => router.push(`/campaigns/${c.id}/group`)}
          className="w-full rounded-2xl bg-brand-gradient py-4 text-base font-bold text-white shadow-glow transition active:scale-[.99]"
        >
          {t("cmp.group.detail.create")}
        </button>
      </div>
    </>
  );
}
