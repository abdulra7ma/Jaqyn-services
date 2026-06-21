"use client";

import { ApiClientError } from "@jaqyn/api";
import { useI18n } from "@jaqyn/i18n";

/** Map any thrown error to a localized message (backend code → localized text). */
export function useErrMessage() {
  const { locale, t } = useI18n();
  return (error: unknown): string =>
    error instanceof ApiClientError ? error.localized(locale) : t("common.error");
}
