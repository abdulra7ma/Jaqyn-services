"use client";

import { useSheetDrag } from "./useSheetDrag";
import { BusinessDetailsContent } from "./BusinessDetailsContent";

/**
 * Full-width bottom sheet for business details.
 * Rendered inline on the nearby list (no navigation) so the map + list
 * stay live behind it. Also used by the standalone `/nearby/[id]` route.
 */
export function BusinessSheet({
  businessId,
  onClose,
}: {
  businessId: string;
  onClose: () => void;
}) {
  const { dragStyle, touchHandlers } = useSheetDrag(onClose);

  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col justify-end"
      style={{ background: "rgba(8,6,3,.45)" }}
      onClick={onClose}
    >
      <div
        className="relative max-h-[94dvh] overflow-y-auto rounded-t-[28px] bg-board"
        style={{
          animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
          paddingBottom: "env(safe-area-inset-bottom, 16px)",
          ...dragStyle,
        }}
        onClick={(e) => e.stopPropagation()}
        {...touchHandlers}
      >
        {/* drag handle */}
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-line" />
        </div>

        <div className="px-4 pb-4">
          <BusinessDetailsContent businessId={businessId} />
        </div>
      </div>
    </div>
  );
}
