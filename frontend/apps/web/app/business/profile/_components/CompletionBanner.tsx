"use client";

// Profile-completion banner — pinned above every settings section so the owner
// always sees how close the profile is to publishable, whatever tab they're on.
// Each missing-field chip jumps to the section that fixes it.

import { useBusinessMe, useOnboardingState } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { CARD } from "./parts";

// Which settings section fixes each required field. Keyed by the backend's
// English `label` (from businesses/onboarding_services.py required_fields), with
// a coarse per-step fallback for any label not listed. Step 1 spans several
// sections, so the label map is what makes each chip land in the right place.
const FIELD_SECTION: Record<string, string> = {
  "Business name": "profile",
  Description: "profile",
  "Business type": "profile",
  "Primary phone": "contact",
  "Address & map location": "contact",
  "Logo image": "brand",
  "Catalog (add at least one)": "menu",
};
const STEP_SECTION: Record<number, string> = { 1: "profile", 2: "profile", 3: "menu" };

export function CompletionBanner({ goTo }: { goTo: (section: string) => void }) {
  const t = useT();
  const me = useBusinessMe();
  const onboarding = useOnboardingState();

  const completion = onboarding.data?.completion_score ?? me.data?.completion_score ?? 0;
  const missing = onboarding.data?.missing_required_fields ?? me.data?.missing_required_fields ?? [];

  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-[15px] font-bold text-ink">{t("owner.profile.completion")}</div>
          <div className="mt-[3px] text-[12.5px] text-subtle">{t("owner.profile.completionHint")}</div>
        </div>
        <span className="rounded-pill bg-brand-muted px-3 py-1 text-[12.5px] font-bold text-brand">{completion}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-pill bg-[#F0E7D8]">
        <div className="h-full rounded-pill bg-brand transition-all" style={{ width: `${completion}%` }} />
      </div>
      {missing.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {missing.map((m) => (
            <button
              key={`${m.step}-${m.label}`}
              type="button"
              onClick={() => goTo(FIELD_SECTION[m.label] ?? STEP_SECTION[m.step] ?? "profile")}
              className="flex items-center gap-1 rounded-pill border border-line bg-[#FBF7F0] px-3 py-1.5 text-xs font-semibold text-subtle transition hover:border-brand hover:text-brand"
            >
              {m.label}
              <span aria-hidden>→</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-sage-soft px-3.5 py-3 text-[13px] font-semibold text-ok">
          {t("owner.profile.requiredComplete")}
        </div>
      )}
    </div>
  );
}
