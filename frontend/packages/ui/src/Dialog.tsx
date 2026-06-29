"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import type React from "react";
import { cn } from "./cn";

/** Shared with Sheet: one z-index for the overlay system. */
const DIALOG_Z = "z-[60]";

/** Scrim tint — ink @ .34 (design-system §10 / .dc.html). */
const SCRIM = "fixed inset-0 bg-ink/[0.34]";

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** i18n string — visible heading + accessible name. */
  title: string;
  children: React.ReactNode;
  /** i18n string, required for a11y. Defaults the accessible name to `title`. */
  ariaLabel: string;
};

/**
 * Centered modal on BOTH viewports (unlike Sheet, which is a Drawer on mobile).
 * Uses the design-system modal tokens: rounded-modal (24px), shadow-modal, ink@.34
 * scrim, jqRise enter. Focus trap, scroll lock, ESC and roles come from Radix.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  ariaLabel,
}: DialogProps): JSX.Element {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={cn(SCRIM, DIALOG_Z)} />
        <RadixDialog.Content
          aria-label={ariaLabel}
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
            DIALOG_Z,
            "w-full max-w-sm outline-none",
            "rounded-modal bg-card p-[22px] shadow-modal",
            "max-h-[calc(100dvh-48px)] overflow-y-auto",
            "animate-[jqRise_.34s_cubic-bezier(.22,1,.36,1)]",
          )}
        >
          <RadixDialog.Title className="font-display text-[17px] font-bold text-ink">
            {title}
          </RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
