"use client";

/**
 * ShareCard — 9:16 patch share artboard.
 *
 * Fixed full-screen overlay containing a 9:16 artboard (kraft weave bg,
 * flat-shadow PatchBadge, patch name in display font, confetti whisper,
 * "@jaqyn" footer). Two actions:
 *   "Save image" — dynamic import("html-to-image"), renders the artboard at
 *     1080×1920 (pixelRatio math), triggers download PNG.
 *   "Share to Stories" — Web Share API with the generated file when
 *     navigator.canShare({files}). Button hidden when not supported.
 *
 * Both actions are client-only. Errors are surfaced (no silent catch).
 *
 * Caller gates on patch.earned — only earned patches have share.
 */

import type { PatchOut, User } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useReducedMotion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { Confetti } from "../_components/Confetti";
import { UserAvatar } from "../../_components/kit";
import { PatchBadge } from "./PatchBadge";

// Artboard rendered at 360×640 CSS px; pixelRatio=3 produces 1080×1920 PNG.
const ARTBOARD_W = 360;
const ARTBOARD_H = 640;
const PIXEL_RATIO = 3; // ARTBOARD_W × 3 = 1080, ARTBOARD_H × 3 = 1920

interface ShareCardProps {
  patch: PatchOut;
  onClose: () => void;
  // Owner identity stamped on the artboard (photo + name). Optional so the card
  // still renders when the caller has no user context.
  user?: Pick<User, "avatar" | "avatar_emoji" | "name" | "phone">;
}

export function ShareCard({ patch, onClose, user }: ShareCardProps): JSX.Element {
  const t = useT();
  const reduced = useReducedMotion();
  const artboardRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Slug-keyed name with backend fallback (same logic as usePatchName, but inline
  // to avoid cross-file hook dependency — ShareCard is a leaf component).
  const nameKey = `patch.def.${patch.slug}.name`;
  const rawName = t(nameKey);
  const patchName = rawName === nameKey ? patch.name : rawName;

  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function";

  /** Generate PNG blob from the artboard node. */
  const generateBlob = useCallback(async (): Promise<Blob> => {
    const node = artboardRef.current;
    if (!node) throw new Error("Artboard not mounted");
    // Dynamic import so html-to-image stays out of the initial bundle.
    const { toPng } = await import("html-to-image");
    // html-to-image scales the cloned node to `width×height` then multiplies each
    // dimension by pixelRatio. Pass the artboard's CSS dimensions (360×640) so the
    // exported canvas is exactly 1080×1920 (360×3 = 1080, 640×3 = 1920).
    const dataUrl = await toPng(node, {
      width: ARTBOARD_W,
      height: ARTBOARD_H,
      pixelRatio: PIXEL_RATIO,
      style: { borderRadius: "0" },
    });
    const res = await fetch(dataUrl);
    return res.blob();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const blob = await generateBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `patch-${patch.slug}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [generateBlob, patch.slug]);

  const handleShareStories = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const blob = await generateBlob();
      const file = new File([blob], `patch-${patch.slug}.png`, { type: "image/png" });
      if (!navigator.canShare({ files: [file] })) {
        setSaveError("Sharing files is not supported on this device.");
        return;
      }
      await navigator.share({
        files: [file],
        title: patchName,
        text: t("patch.share.card.footer"),
      });
    } catch (err) {
      // User cancelled share — not an error worth surfacing.
      if (err instanceof Error && err.name !== "AbortError") {
        setSaveError(err.message);
      }
    } finally {
      setSaving(false);
    }
  }, [generateBlob, patch.slug, patchName, t]);

  const colors = { light: patch.light, color: patch.color, deep: patch.deep };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-ink/70">
      {/* Close backdrop tap */}
      <button
        type="button"
        aria-label={t("common.close")}
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
      />

      {/* Artboard — fixed 360×640 CSS size; export captures at PIXEL_RATIO×3 = 1080×1920. */}
      <div
        ref={artboardRef}
        className="relative flex flex-col items-center justify-center overflow-hidden bg-patch-share-board"
        style={{
          width: ARTBOARD_W,
          height: ARTBOARD_H,
          borderRadius: 24,
        }}
      >
        {/* Confetti whisper (reduced motion: skip) */}
        {!reduced && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
            <Confetti loop={false} />
          </div>
        )}

        {/* Top bar — Jaqyn wordmark tile (left) + owner name & avatar (right).
            Note: the avatar <img> must be same-origin (dev /media rewrite) or
            served with CORS for html-to-image to inline it into the PNG. */}
        <div className="absolute left-5 right-5 top-5 flex items-center justify-between">
          <div
            className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-brand font-display text-lg font-bold text-white"
            aria-label="Jaqyn"
          >
            J
          </div>
          {user ? (
            <div className="flex min-w-0 items-center justify-end gap-2">
              {user.name && (
                <span className="truncate font-display text-sm font-bold text-ink">
                  {user.name}
                </span>
              )}
              <UserAvatar user={user} size={36} />
            </div>
          ) : (
            <span />
          )}
        </div>

        {/* Patch badge — flat shadow per spec */}
        <div className="flex flex-col items-center gap-6 px-8 text-center">
          <PatchBadge
            shape={patch.shape}
            colors={colors}
            icon={patch.icon}
            size={172}
            shadow="flat"
          />
          <h2
            className="font-display font-bold text-ink"
            style={{ fontSize: 28, lineHeight: 1.2 }}
          >
            {patchName}
          </h2>
        </div>

        {/* Footer wordmark */}
        <p
          className="absolute bottom-8 text-subtle font-sans text-sm"
          style={{ letterSpacing: "0.04em" }}
        >
          {t("patch.share.card.footer")}
        </p>
      </div>

      {/* Action buttons — outside the artboard (not exported) */}
      <div className="relative z-10 flex flex-col gap-3 w-full max-w-xs px-6 mt-6">
        {saveError && (
          <p className="text-danger text-xs text-center font-sans">{saveError}</p>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-pill bg-brand text-white font-sans font-semibold py-3 text-sm disabled:opacity-60"
        >
          {saving ? "…" : t("patch.share.save")}
        </button>

        {canShareFiles && (
          <button
            type="button"
            onClick={handleShareStories}
            disabled={saving}
            className="w-full rounded-pill border border-line text-ink font-sans font-semibold py-3 text-sm disabled:opacity-60"
          >
            {t("patch.share.stories")}
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-pill border border-line/50 text-subtle font-sans font-medium py-2.5 text-sm"
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
