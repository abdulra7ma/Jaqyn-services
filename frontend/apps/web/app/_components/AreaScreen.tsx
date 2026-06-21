"use client";

import { useHealth, ApiClientError } from "@jaqyn/api";
import { LanguageSwitch, useI18n } from "@jaqyn/i18n";
import { Loading, ErrorState } from "@jaqyn/ui";

// Shared shell for each area (customer / business / staff). The three areas are
// distinct apps in product terms but render from one Next router + one container.
export function AreaScreen({ titleKey }: { titleKey: string }) {
  const { locale, t } = useI18n();
  const { data, isLoading, isError, error, refetch } = useHealth();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-brand">{t(titleKey)}</h1>
        <LanguageSwitch />
      </header>

      <nav className="flex gap-3 text-sm text-subtle">
        <a href="/" className="hover:text-brand">{t("app.customer")}</a>
        <a href="/business" className="hover:text-brand">{t("app.business")}</a>
        <a href="/staff" className="hover:text-brand">{t("app.staff")}</a>
      </nav>

      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-3 font-medium text-ink">{t("health.title")}</h2>
        {isLoading && <Loading label={t("common.loading")} />}
        {isError && (
          <ErrorState
            message={
              error instanceof ApiClientError ? error.localized(locale) : t("common.error")
            }
            onRetry={() => refetch()}
            retryLabel={t("common.retry")}
          />
        )}
        {data && (
          <p className={data.status === "ok" ? "text-ok" : "text-danger"}>
            {data.status === "ok" ? t("health.ok") : t("health.degraded")} · db:
            {String(data.db)} · redis:{String(data.redis)}
          </p>
        )}
      </section>
    </main>
  );
}
