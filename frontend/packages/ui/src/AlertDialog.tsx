"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { Button } from "./Button";
import { cn } from "./cn";

/** Shared with Sheet/Dialog: one z-index for the overlay system. */
const ALERT_Z = "z-[60]";

/** Scrim tint — ink @ .34 (design-system §10 / .dc.html). */
const SCRIM = "fixed inset-0 bg-ink/[0.34]";

export type AlertDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** i18n string. */
  title: string;
  /** i18n string. */
  description?: string;
  /** i18n string. */
  confirmLabel: string;
  /** i18n string. */
  cancelLabel: string;
  onConfirm: () => void;
  /** Renders the confirm button in the Button `danger` variant (§4). */
  destructive?: boolean;
  /** Disables confirm while a mutation runs (and the dialog stays open). */
  pending?: boolean;
};

/**
 * Binary / destructive confirm on both viewports. Reuses the @jaqyn/ui Button:
 * the confirm button takes the `danger` variant when `destructive`, and is
 * disabled while `pending` so a slow mutation can't be double-fired. Built on
 * Radix Dialog for focus trap, scroll lock, ESC and roles.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  pending = false,
}: AlertDialogProps): JSX.Element {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={cn(SCRIM, ALERT_Z)} />
        <RadixDialog.Content
          role="alertdialog"
          aria-label={title}
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
            ALERT_Z,
            "w-full max-w-xs outline-none",
            "rounded-modal bg-card p-[22px] shadow-modal text-center",
            "animate-[jqRise_.34s_cubic-bezier(.22,1,.36,1)]",
          )}
        >
          <RadixDialog.Title className="font-display text-[17px] font-bold text-ink">
            {title}
          </RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="mt-2 text-sm text-subtle">
              {description}
            </RadixDialog.Description>
          )}
          <div className="mt-5 flex flex-col gap-2.5">
            <Button
              variant={destructive ? "danger" : "primary"}
              disabled={pending}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
            <RadixDialog.Close asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </RadixDialog.Close>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
