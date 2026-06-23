"use client";

import { useT } from "@jaqyn/i18n";
import { ErrorState, Loading } from "@jaqyn/ui";

// Route-segment loading / error fallbacks shared across the campaign routes.
// Next requires error.tsx to be a Client Component (it receives `reset`), so both
// live here behind the cream page background the campaign shell uses.

export function SegmentLoading() {
  const t = useT();
  return (
    <div className="min-h-[100dvh] bg-cream px-4 py-8">
      <Loading label={t("common.loading")} />
    </div>
  );
}

export function SegmentError({ reset }: { reset: () => void }) {
  const t = useT();
  return (
    <div className="min-h-[100dvh] bg-cream px-4 py-8">
      <ErrorState message={t("common.error")} onRetry={reset} retryLabel={t("common.retry")} />
    </div>
  );
}
