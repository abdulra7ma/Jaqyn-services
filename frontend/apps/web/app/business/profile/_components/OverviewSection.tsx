"use client";

// Settings › Overview: at-a-glance business details (logo, identity, contact) +
// the two cross-cutting actions (view public page, submit for verification).
// The completion meter lives in the pinned banner above, not here.

import Link from "next/link";
import { useBusinessMe, useCatalog, useOnboardingState, useSubmitOnboarding } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { CARD, LABEL, SectionCard, type Notify } from "./parts";
import { formatWeek } from "./WeekHoursEditor";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-ink">{value || "—"}</div>
    </div>
  );
}

export function OverviewSection({ notify }: { notify: Notify }) {
  const t = useT();
  const me = useBusinessMe();
  const onboarding = useOnboardingState();
  const catalog = useCatalog();
  const submit = useSubmitOnboarding();

  const b = me.data;
  const missing = onboarding.data?.missing_required_fields ?? me.data?.missing_required_fields ?? [];
  const items = catalog.data ?? [];
  const readyToSubmit = missing.length === 0 && items.length > 0;
  const publicHref = b?.id ? `/nearby/${b.id}` : "/nearby";

  const category = b?.category ? t(`owner.profile.category.${b.category}`) : "";
  const meta = [category, b?.area || b?.address].filter(Boolean).join(" · ");
  const hours = formatWeek(b?.working_hours, (d) => t(`owner.settings.day.${d}`));
  const tags = b?.tags ?? [];

  function submitForReview() {
    submit.mutate(undefined, {
      onSuccess: () => {
        notify(t("owner.profile.submitted"));
        onboarding.refetch();
      },
      onError: (e: unknown) => notify((e as { message?: string })?.message ?? t("owner.profile.completeFirst")),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t("owner.settings.general")}>
        {/* identity header */}
        <div className="mt-3.5 flex items-center gap-3.5">
          <div className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-[16px] border border-line bg-brand-muted text-2xl">
            {b?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              b?.glyph || "☕"
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-bold text-ink">{b?.name || t("owner.profile.yourBusiness")}</div>
            <div className="mt-0.5 truncate text-[13px] text-subtle">{meta || "—"}</div>
          </div>
          {b?.price_level ? (
            <span className="ml-auto flex-none rounded-pill bg-[#F4ECDF] px-2.5 py-1 text-[12.5px] font-bold text-subtle">
              {b.price_level}
            </span>
          ) : null}
        </div>

        {/* detail grid */}
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
          <Detail label={t("biz.phone")} value={b?.phone ?? ""} />
          <Detail label={t("owner.profile.publicEmail")} value={b?.public_email ?? ""} />
          <Detail label={t("owner.profile.hours")} value={hours} />
          <Detail label={t("owner.profile.website")} value={b?.website_url ?? ""} />
          <Detail label={t("biz.address")} value={b?.address ?? ""} />
          <Detail label={t("owner.profile.city")} value={b?.city ?? ""} />
        </div>

        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span key={tag} className="rounded-pill bg-[#F4ECDF] px-2.5 py-1 text-[11px] font-semibold text-subtle">
                {tag}
              </span>
            ))}
          </div>
        )}

        {b?.description ? (
          <p className="mt-4 text-[12.5px] leading-relaxed text-subtle">{b.description}</p>
        ) : null}
      </SectionCard>

      <div className={CARD}>
        <div className="flex flex-col gap-[11px] sm:flex-row">
          <Link
            href={publicHref}
            className="flex flex-1 items-center justify-center rounded-[14px] border-[1.5px] border-line bg-card py-[15px] text-[14.5px] font-semibold text-ink"
          >
            {t("owner.profile.viewCustomer")}
          </Link>
          <button
            onClick={submitForReview}
            disabled={!readyToSubmit || submit.isPending}
            className="flex-[1.6] rounded-[14px] bg-ink py-[15px] text-[14.5px] font-bold text-cream shadow-card disabled:opacity-45"
          >
            {submit.isPending ? t("owner.profile.submitting") : t("owner.profile.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
