"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import type React from "react";
import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { cn } from "./cn";

/**
 * Single z-index scale for the whole overlay system. Defined ONCE here so the
 * four divergent hand-rolls (z 55/60/70/80) collapse to one value. Scrim and
 * surface share it; the surface paints after the scrim in DOM order.
 */
const SHEET_Z = "z-[60]";

/** Scrim tint — ink @ .34 (design-system §10 / .dc.html bottom-sheet + modal). */
const SCRIM = "fixed inset-0 bg-ink/[0.34]";

type Surface = "card" | "board" | "cream" | "transparent";
type Variant = "modal" | "persistent";
type Side = "bottom" | "right";

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Header / handle / scroll are provided by the calling shell. */
  children: React.ReactNode;
  /** `persistent` renders no scrim (e.g. the floating QR sheet). */
  variant?: Variant;
  /** Expanding peek -> half -> full. Mobile (Drawer) only. */
  snapPoints?: (number | string)[];
  /** §8 surface tone. */
  surface?: Surface;
  /** Desktop side-panel option (staff detail). Mobile is always bottom. */
  side?: Side;
  /**
   * Apply the design-system canonical horizontal padding (`px-[22px]`) to the
   * surface. Default `true`. Set `false` when the caller's content self-pads
   * (e.g. the migrated hand-rolls) so the surface doesn't double-inset.
   */
  padded?: boolean;
  /**
   * This sheet opens while another mobile Drawer is already open. Below `md`,
   * uses Vaul `Drawer.NestedRoot` so the two stack without scroll-lock/dismiss
   * fighting. Ignored on desktop — Radix Dialogs nest fine on their own.
   */
  nested?: boolean;
  /**
   * Render the mobile drag handle (grabber). Default `true`. Set `false` for
   * modal action/result sheets that auto-dismiss or have explicit buttons and
   * never had a handle (e.g. the staff-scan result sheets).
   */
  showGrabber?: boolean;
  /** i18n string, required for a11y (labels the dialog/drawer). */
  ariaLabel: string;
};

const SURFACE: Record<Surface, string> = {
  card: "bg-card",
  board: "bg-board",
  // §1 app screen background — cleaner than the warm `board` tan for detail sheets.
  cream: "bg-cream",
  // No panel: the content floats over the live page (e.g. the QR sheet). The
  // caller should pair this with `variant="persistent"` so nothing is dimmed.
  transparent: "bg-transparent",
};

/**
 * SSR-safe `md` (>=768px) media query. Returns `false` until mounted so the
 * server and first client render both pick the mobile Drawer — no hydration
 * mismatch, no Dialog flashing in on a phone.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width:768px)");
    const sync = (): void => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return isDesktop;
}

/**
 * Responsive overlay: a bottom Drawer (Vaul) below `md`, a centered/side Dialog
 * (Radix) at/above `md`. The same caller props render the right thing per
 * viewport, so screens never branch on width.
 *
 * Surface, scrim, radius, shadow and padding come from the design-system tokens
 * (rounded-sheet, bg-handle, shadow-sheet, bg-ink/[0.34]); the sheet never goes
 * fully full-screen (max-h leaves 48px of scrim at the top). Focus trap, scroll
 * lock, ESC and roles are owned by the underlying libraries.
 */
export function Sheet({
  open,
  onOpenChange,
  children,
  variant = "modal",
  snapPoints,
  surface = "card",
  side = "bottom",
  padded = true,
  nested = false,
  showGrabber = true,
  ariaLabel,
}: SheetProps): JSX.Element {
  const isDesktop = useIsDesktop();
  const withScrim = variant !== "persistent";
  // A transparent surface is a floating, panel-less sheet — drop the panel
  // shadow (a shadow with no surface behind it reads as a stray line).
  const noShadow = surface === "transparent";

  // DS canonical horizontal inset. Omitted when the caller self-pads (`padded`
  // false) so the surface doesn't double-inset its content.
  const padX = padded ? "px-[22px]" : "";

  const grabber = (
    <div
      aria-hidden
      className="h-[5px] w-[42px] bg-handle rounded-pill mx-auto mb-4 shrink-0"
    />
  );

  if (isDesktop) {
    // Desktop: Radix Dialog. `bottom` -> centered card; `right` -> side panel.
    // Radix Content has no overscroll ::after pseudo-element, so Content itself
    // can be the scroll container without balloon scrollHeight.
    const isSide = side === "right";
    const contentClass = isSide
      ? cn(
          "fixed inset-y-0 right-0",
          SHEET_Z,
          "w-full max-w-md outline-none",
          SURFACE[surface],
          "flex flex-col overflow-y-auto",
          "pt-2.5 pb-[22px]",
          padX,
          !noShadow && "shadow-modal",
          "animate-[jqSlide_.34s_cubic-bezier(.22,1,.36,1)]",
        )
      : cn(
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          SHEET_Z,
          "w-full max-w-md outline-none",
          SURFACE[surface],
          "flex flex-col max-h-[calc(100dvh-48px)] overflow-y-auto",
          "rounded-modal pt-2.5 pb-[22px]",
          padX,
          !noShadow && "shadow-modal",
          "animate-[jqRise_.34s_cubic-bezier(.22,1,.36,1)]",
        );

    return (
      <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
        <RadixDialog.Portal>
          {withScrim && <RadixDialog.Overlay className={cn(SCRIM, SHEET_Z)} />}
          <RadixDialog.Content className={contentClass} aria-label={ariaLabel}>
            <RadixDialog.Title className="sr-only">{ariaLabel}</RadixDialog.Title>
            {children}
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    );
  }

  // Mobile: Vaul bottom Drawer (drag-to-dismiss, snap points, scroll lock).
  // A drawer stacked on an already-open drawer must use NestedRoot, or the two
  // fight over scroll-lock and background dismissal.
  //
  // SCROLL BUG FIX: Vaul's Drawer.Content emits a `::after` pseudo-element at
  // `position:absolute; top:100%; height:200%` (the overscroll filler). If
  // Content is also the scroll container (overflow-y-auto) that filler becomes
  // scrollable, ballooning scrollHeight to ~3× viewport — producing a huge empty
  // area below the real content. Fix: Content is a NON-scrolling positioning
  // surface (fixed, rounded, shadow). All scroll/flex/padding live on an inner
  // div so the ::after stays off-screen and is never reachable by the user.
  const Root = nested ? Drawer.NestedRoot : Drawer.Root;
  return (
    <Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={snapPoints}
      modal={withScrim}
    >
      <Drawer.Portal>
        {withScrim && <Drawer.Overlay className={cn(SCRIM, SHEET_Z)} />}
        <Drawer.Content
          aria-label={ariaLabel}
          className={cn(
            "fixed inset-x-0 bottom-0 outline-none",
            SHEET_Z,
            "rounded-sheet",
            !noShadow && "shadow-sheet",
            SURFACE[surface],
          )}
        >
          <Drawer.Title className="sr-only">{ariaLabel}</Drawer.Title>
          {/* Inner scroll container — keeps the Vaul ::after overscroll filler
              outside the scrollable area so scrollHeight ≈ content height. */}
          <div
            className={cn(
              "flex flex-col max-h-[calc(100dvh-48px)] overflow-y-auto",
              "pt-2.5 pb-[22px] pb-[env(safe-area-inset-bottom,16px)]",
              padX,
            )}
          >
            {showGrabber && grabber}
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Root>
  );
}
