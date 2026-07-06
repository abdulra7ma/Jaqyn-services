"use client";

import { LOCALES, type Locale } from "./locales";
import { useI18n } from "./provider";

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className="inline-flex items-center rounded-pill border border-line bg-tile p-0.5"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={locale === l}
          onClick={() => setLocale(l as Locale)}
          className={
            locale === l
              ? "rounded-pill bg-card px-2.5 py-1 text-xs font-semibold text-ink shadow-sm"
              : "rounded-pill px-2.5 py-1 text-xs font-medium text-subtle transition-colors hover:text-ink"
          }
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
