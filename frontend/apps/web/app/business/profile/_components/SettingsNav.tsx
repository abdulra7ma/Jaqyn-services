"use client";

// In-page settings navigation: a sticky vertical rail on desktop, a horizontal
// scrollable chip row on mobile. Switches the active section (page owns state).

import { useT } from "@jaqyn/i18n";

type IconComponent = (props: { className?: string }) => React.JSX.Element;
export type SectionDef = { key: string; labelKey: string; icon: IconComponent };

export function SettingsNav({
  sections,
  active,
  onSelect,
}: {
  sections: readonly SectionDef[];
  active: string;
  onSelect: (key: string) => void;
}) {
  const t = useT();
  return (
    <>
      {/* mobile: horizontal chips */}
      <nav
        aria-label={t("owner.nav.settings")}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden"
      >
        {sections.map((s) => {
          const on = s.key === active;
          return (
            <button
              key={s.key}
              onClick={() => onSelect(s.key)}
              aria-current={on ? "page" : undefined}
              className={`flex flex-none items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold transition ${
                on ? "bg-brand text-brand-fg" : "border border-line bg-card text-subtle"
              }`}
            >
              <s.icon className="h-4 w-4 flex-none" />
              {t(s.labelKey)}
            </button>
          );
        })}
      </nav>

      {/* desktop: vertical rail */}
      <nav
        aria-label={t("owner.nav.settings")}
        className="hidden w-[200px] flex-none flex-col gap-0.5 self-start lg:sticky lg:top-0 lg:flex"
      >
        {sections.map((s) => {
          const on = s.key === active;
          return (
            <button
              key={s.key}
              onClick={() => onSelect(s.key)}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-10 items-center gap-2.5 rounded-[11px] px-3.5 py-2.5 text-left text-[13.5px] font-semibold transition ${
                on ? "bg-brand text-brand-fg shadow-[0_8px_20px_-12px_rgba(203,92,55,.8)]" : "text-ink hover:bg-black/[0.04]"
              }`}
            >
              <s.icon className="h-[18px] w-[18px] flex-none" />
              {t(s.labelKey)}
            </button>
          );
        })}
      </nav>
    </>
  );
}
