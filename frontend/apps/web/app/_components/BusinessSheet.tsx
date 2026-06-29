"use client";

import { Sheet } from "@jaqyn/ui";
import { useT } from "@jaqyn/i18n";
import { BusinessDetailsContent } from "./BusinessDetailsContent";

/**
 * Full-width bottom sheet for business details.
 * Rendered inline on the nearby list (no navigation) so the map + list
 * stay live behind it. Also used by the standalone `/nearby/[id]` route.
 * Delegates to `Sheet surface="board"` from `@jaqyn/ui` — Vaul Drawer on
 * mobile, Radix Dialog on desktop. Drag, scroll lock and focus trap are
 * handled by the underlying library. `padded={false}` — the content self-pads
 * (`px-4`), matching the original hand-roll which had no surface padding.
 */
export function BusinessSheet({
  businessId,
  onClose,
}: {
  businessId: string;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Sheet
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      variant="modal"
      surface="cream"
      padded={false}
      ariaLabel={t("nearby.title")}
    >
      <div className="px-4 pb-4">
        <BusinessDetailsContent businessId={businessId} />
      </div>
    </Sheet>
  );
}
