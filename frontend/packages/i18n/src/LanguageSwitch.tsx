"use client";

import { LOCALES, type Locale } from "./locales";
import { useI18n } from "./provider";

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-subtle">
      {t("common.language")}
      <select
        aria-label={t("common.language")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-ink"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
