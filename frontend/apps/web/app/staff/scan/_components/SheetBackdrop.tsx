import type React from "react";

/** Full-screen dim + bottom sheet, rendered ABOVE the fixed bottom nav (z-50) so
 *  result cards are never clipped by it. Tapping the backdrop dismisses. */
export function SheetBackdrop({
  dim = "rgba(8,6,3,.55)",
  onDismiss,
  children,
}: {
  dim?: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 z-[60] flex flex-col justify-end"
      style={{ background: dim }}
      onClick={onDismiss}
    >
      {children}
    </div>
  );
}

/** Shared bottom-sheet surface. The safe-area bottom inset keeps the sheet's last
 *  line and primary button clear of the home indicator (the nav itself now sits
 *  beneath this z-60 overlay). */
export const SHEET_STYLE: React.CSSProperties = {
  position: "relative",
  background: "#fff",
  borderRadius: "30px 30px 0 0",
  animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
};
