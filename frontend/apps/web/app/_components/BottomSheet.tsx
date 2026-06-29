"use client";

import type React from "react";
import { Sheet } from "@jaqyn/ui";
import { useT } from "@jaqyn/i18n";

/**
 * Dimmed full-width bottom-sheet. Delegates to `Sheet variant="modal"` from
 * `@jaqyn/ui` — Vaul Drawer on mobile, Radix Dialog on desktop. Scroll lock,
 * drag-to-dismiss, focus trap and ESC are all handled by the underlying library.
 *
 * `padded={false}` — the loyalty content self-pads (`px-5`), matching the
 * original hand-roll which had no surface horizontal padding.
 * `nested` — this sheet opens while `BusinessSheet` is already open on the
 * nearby list, so its mobile Drawer must stack via Vaul `NestedRoot`.
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
  const t = useT();
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      variant="modal"
      surface="card"
      padded={false}
      nested
      ariaLabel={t("cmp.loyalty.title")}
    >
      {children}
    </Sheet>
  );
}
