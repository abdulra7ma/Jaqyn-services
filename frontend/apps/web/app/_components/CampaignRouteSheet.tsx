"use client";

import { useT } from "@jaqyn/i18n";
import { Sheet } from "@jaqyn/ui";
import type { ReactNode } from "react";

/**
 * Route-backed campaign overlay. Direct links keep their URL while presenting
 * the same draggable mobile sheet / centered desktop dialog used in-app.
 */
export function CampaignRouteSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      variant="modal"
      surface="cream"
      padded={false}
      ariaLabel={title}
    >
      <div className="px-4 pb-2">
        <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-2 flex justify-end bg-cream/95 px-1 py-1 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-xl font-semibold text-subtle shadow-card transition hover:text-ink active:scale-95"
          >
            <span aria-hidden>×</span>
          </button>
        </div>
        {children}
      </div>
    </Sheet>
  );
}
