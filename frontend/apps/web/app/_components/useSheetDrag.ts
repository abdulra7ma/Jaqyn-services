"use client";

import type React from "react";
import { useRef, useState } from "react";

/**
 * Shared drag-to-dismiss gesture hook used by every sheet in the app.
 * Down > 100 px → slide-out animation then `onDismiss`.
 * Up → rubber-band resistance, snaps back on release.
 */
export function useSheetDrag(onDismiss: () => void) {
  const startY = useRef(0);
  const isDragging = useRef(false);
  const [dragY, setDragY] = useState(0);
  const [snapping, setSnapping] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0]!.clientY;
    isDragging.current = true;
    setSnapping(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging.current) return;
    const delta = e.touches[0]!.clientY - startY.current;
    // Upward drag gets elastic resistance.
    const clamped =
      delta < 0 ? Math.max(delta, -50 + (delta + 50) * 0.15) : delta;
    setDragY(clamped);
  }

  function onTouchEnd() {
    isDragging.current = false;
    if (dragY > 100) {
      setDragY(window.innerHeight);
      setTimeout(onDismiss, 280);
    } else {
      setSnapping(true);
      setDragY(0);
    }
  }

  /** Apply to the draggable element's `style` prop. */
  const dragStyle: React.CSSProperties =
    dragY !== 0 || snapping
      ? {
          transform: `translateY(${dragY}px)`,
          transition:
            snapping || dragY >= window.innerHeight
              ? "transform .28s cubic-bezier(.22,1,.36,1)"
              : "none",
        }
      : {};

  const touchHandlers = { onTouchStart, onTouchMove, onTouchEnd };

  return { dragStyle, touchHandlers };
}
