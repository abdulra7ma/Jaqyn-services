"use client";

import type React from "react";
import { useEffect } from "react";
import { useSheetDrag } from "./useSheetDrag";

/**
 * Dimmed full-width bottom-sheet. Slides up with `jqRise`, scrolls internally,
 * dismisses on backdrop tap or drag-down > 100 px.
 */
export function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { dragStyle, touchHandlers } = useSheetDrag(onClose);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      style={{ background: "rgba(8,6,3,.55)" }}
      onClick={onClose}
    >
      <div
        className="relative max-h-[92dvh] overflow-y-auto rounded-t-[28px] bg-card"
        style={{
          animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
          paddingBottom: "env(safe-area-inset-bottom, 16px)",
          ...dragStyle,
        }}
        onClick={(e) => e.stopPropagation()}
        {...touchHandlers}
      >
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-line" />
        </div>
        {children}
      </div>
    </div>
  );
}
