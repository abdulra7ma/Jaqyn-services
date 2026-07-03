"use client";

/**
 * /campaigns/patches — Patch board screen (campaigns redesign F2).
 *
 * States:
 *   - Board: header, next-patch track, kraft board (3-col grid of all patches).
 *   - Detail sheet: earned (colored PatchBadge, jq-patch-in) or locked (muted,
 *     progress bar, "See campaigns").
 *   - Earn moment: full-screen overlay for unseen_earned, queued one-at-a-time.
 *   - Share card: 9:16 story artboard with save + share-to-stories.
 *
 * Board-seen: POST on first mount when !board_seen, latched by a ref to avoid
 * double-fire from React Strict Mode + invalidation refetch race.
 *
 * Unseen-earned queue: snapshotted into local state on first non-empty read so
 * invalidations mid-queue don't shuffle the array.
 */

import {
  useMarkPatchBoardSeen,
  useMarkPatchesSeen,
  usePatches,
  type PatchOut,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Sheet } from "@jaqyn/ui";
import { useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Confetti } from "../_components/Confetti";
import { CustomerShell } from "../../_components/CustomerShell";
import { useRequireAuth } from "../../_lib/auth";
import { PatchBadge, type PatchColors } from "./PatchBadge";
import { ShareCard } from "./ShareCard";

// ---- Helpers ------------------------------------------------------------------

/** Map flat PatchOut colors to the PatchBadge colors prop. */
function toCols(p: Pick<PatchOut, "light" | "color" | "deep">): PatchColors {
  return { light: p.light, color: p.color, deep: p.deep };
}

/**
 * Resolve a slug-keyed i18n string with backend fallback.
 * `t()` echoes the key when a translation is missing — compare to detect a miss.
 */
function usePatchName(slug: string, backendName: string): string {
  const t = useT();
  const key = `patch.def.${slug}.name`;
  const v = t(key);
  return v === key ? backendName : v;
}

function usePatchHow(slug: string, backendHow: string): string {
  const t = useT();
  const key = `patch.def.${slug}.how`;
  const v = t(key);
  return v === key ? backendHow : v;
}

// ---- Next-patch track card ----------------------------------------------------

interface NextTrackCardProps {
  next: NonNullable<ReturnType<typeof usePatches>["data"]>["next"];
}

function NextTrackCard({ next }: NextTrackCardProps): JSX.Element | null {
  const t = useT();
  if (!next) return null;

  const cols = toCols(next);
  const remaining = next.target - next.current;

  return (
    <div className="mx-4 mb-4 rounded-xl bg-white/60 border border-line px-4 py-3 flex items-center gap-3">
      {/* Current progress badge (colored, represents progress so far) */}
      <PatchBadge shape={next.shape} colors={cols} icon={next.icon} size={48} shadow="soft" />
      {/* Progress info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-subtle font-sans mb-0.5">{t("patch.board.nextLabel")}</p>
        <p className="text-sm font-display font-bold text-ink leading-tight truncate">{next.name}</p>
        <div className="mt-1.5 h-1.5 rounded-full bg-line overflow-hidden">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${Math.min(100, (next.current / next.target) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-subtle mt-0.5">
          {t("patch.next.progress")
            .replace("{n}", String(remaining))
            .replace("{name}", next.name)}
        </p>
      </div>
      {/* Locked target silhouette */}
      <PatchBadge shape={next.shape} colors={cols} icon={next.icon} size={48} locked shadow="none" />
    </div>
  );
}

// ---- Detail sheet (inner content) ---------------------------------------------
// Separated so hooks are always called at the top of a component, never conditionally.

interface DetailSheetContentProps {
  patch: PatchOut;
  onClose: () => void;
  onShare: (p: PatchOut) => void;
}

function DetailSheetContent({ patch, onClose, onShare }: DetailSheetContentProps): JSX.Element {
  const t = useT();
  const patchName = usePatchName(patch.slug, patch.name);
  const patchHow = usePatchHow(patch.slug, patch.how);
  const isEarned = patch.earned;
  const earnedDate = patch.earned_at
    ? new Date(patch.earned_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    : "";

  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-2 text-center gap-3">
      {/* Badge — jq-patch-in animation for earned */}
      <div className={isEarned ? "animate-jq-patch-in" : undefined}>
        <PatchBadge
          shape={patch.shape}
          colors={toCols(patch)}
          icon={patch.icon}
          size={106}
          locked={!isEarned}
          shadow="soft"
        />
      </div>

      <h2 className="font-display font-bold text-xl text-ink leading-tight">{patchName}</h2>

      {isEarned ? (
        <>
          <p className="text-sm text-subtle font-sans">{patchHow}</p>
          {earnedDate && (
            <span className="inline-block rounded-pill bg-sage-soft text-sage px-3 py-1 text-xs font-sans font-medium">
              {t("patch.earned.chip").replace("{date}", earnedDate)}
            </span>
          )}
          <div className="flex gap-3 w-full mt-2">
            <button
              type="button"
              onClick={() => onShare(patch)}
              className="flex-1 rounded-pill bg-brand text-white font-sans font-semibold py-3 text-sm"
            >
              {t("patch.share")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-pill border border-line text-ink font-sans font-semibold py-3 text-sm"
            >
              {t("patch.sheet.earned.close")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-subtle uppercase tracking-wide font-sans">
            {t("patch.sheet.locked.howTo")}
          </p>
          <p className="text-sm text-ink font-sans">{patchHow}</p>
          {patch.progress_target > 0 && (
            <div className="w-full">
              <div className="h-2 rounded-full bg-line overflow-hidden mb-1">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{
                    width: `${Math.min(100, (patch.progress_current / patch.progress_target) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-subtle">
                {t("patch.sheet.locked.progress")
                  .replace("{current}", String(patch.progress_current))
                  .replace("{target}", String(patch.progress_target))}
              </p>
            </div>
          )}
          <Link
            href="/campaigns/discover"
            onClick={onClose}
            className="w-full rounded-pill border border-line text-ink font-sans font-semibold py-3 text-sm text-center block mt-2"
          >
            {t("patch.locked.cta")}
          </Link>
        </>
      )}
    </div>
  );
}

// ---- Detail sheet (shell — always rendered, patch may be null) ----------------

interface DetailSheetProps {
  patch: PatchOut | null;
  open: boolean;
  onClose: () => void;
  onShare: (p: PatchOut) => void;
}

function DetailSheet({ patch, open, onClose, onShare }: DetailSheetProps): JSX.Element {
  const label = patch?.name ?? "Patch";
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      ariaLabel={label}
      surface="cream"
      padded={false}
    >
      {patch && <DetailSheetContent patch={patch} onClose={onClose} onShare={onShare} />}
    </Sheet>
  );
}

// ---- Earn moment overlay ------------------------------------------------------

interface EarnMomentProps {
  patch: PatchOut;
  onKeep: () => void;
  onShare: () => void;
}

function EarnMoment({ patch, onKeep, onShare }: EarnMomentProps): JSX.Element {
  const t = useT();
  const reduced = useReducedMotion();
  const patchName = usePatchName(patch.slug, patch.name);
  const patchHow = usePatchHow(patch.slug, patch.how);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center"
      style={{
        background: reduced
          ? "#FBF6EE"
          : "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(94,139,106,.18) 0%, #FBF6EE 70%)",
      }}
    >
      {!reduced && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <Confetti loop />
        </div>
      )}

      <div className={reduced ? undefined : "animate-jq-pop"}>
        <PatchBadge
          shape={patch.shape}
          colors={toCols(patch)}
          icon={patch.icon}
          size={150}
          shadow="soft"
        />
      </div>

      <div
        className={`mt-6 flex flex-col items-center gap-2 px-8 text-center ${reduced ? "" : "animate-jq-rise"}`}
      >
        <p className="text-xs font-sans text-subtle uppercase tracking-widest">
          {t("patch.earn.newBadge")}
        </p>
        <h2 className="font-display font-bold text-2xl text-ink">{patchName}</h2>
        <p className="text-sm text-subtle font-sans">{patchHow}</p>
        <p className="text-xs text-subtle/70 font-sans">{t("patch.earn.desc")}</p>
      </div>

      <div className="mt-8 flex flex-col gap-3 w-full max-w-xs px-6">
        <button
          type="button"
          onClick={onShare}
          className="w-full rounded-pill bg-brand text-white font-sans font-semibold py-3 text-sm"
        >
          {t("patch.earn.share")}
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="w-full rounded-pill border border-line text-ink font-sans font-semibold py-3 text-sm"
        >
          {t("patch.earn.keep")}
        </button>
      </div>
    </div>
  );
}

// ---- Patch grid item ----------------------------------------------------------

interface PatchGridItemProps {
  patch: PatchOut;
  onTap: () => void;
}

function PatchGridItem({ patch, onTap }: PatchGridItemProps): JSX.Element {
  const patchName = usePatchName(patch.slug, patch.name);
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={patchName}
      className="flex flex-col items-center gap-1 focus-visible:outline-2 focus-visible:outline-brand focus-visible:rounded-xl p-1"
    >
      <PatchBadge
        shape={patch.shape}
        colors={toCols(patch)}
        icon={patch.icon}
        size={82}
        locked={!patch.earned}
        shadow="soft"
      />
      <span
        className="text-xs font-sans leading-tight text-center"
        style={{ color: patch.earned ? "#2E241D" : "#8C7A6A" }}
      >
        {patchName}
      </span>
    </button>
  );
}

// ---- Page ---------------------------------------------------------------------

export default function PatchesPage(): JSX.Element {
  useRequireAuth();
  const t = useT();

  const { data, isLoading, isError } = usePatches();
  const markBoardSeen = useMarkPatchBoardSeen();
  const markSeen = useMarkPatchesSeen();

  // Latch: POST board-seen only once even on Strict Mode double-mount.
  const boardSeenFired = useRef(false);

  // Unseen-earned queue: snapshot on first non-empty read so invalidations
  // mid-queue don't re-shuffle the array.
  const unseenSeeded = useRef(false);
  const [earnQueue, setEarnQueue] = useState<PatchOut[]>([]);
  const [shareTarget, setShareTarget] = useState<PatchOut | null>(null);
  const [sheetPatch, setSheetPatch] = useState<PatchOut | null>(null);

  // Seed the queue once from the first data read.
  useEffect(() => {
    if (!data || unseenSeeded.current) return;
    unseenSeeded.current = true;
    if (data.unseen_earned.length > 0) {
      setEarnQueue([...data.unseen_earned]);
    }
  }, [data]);

  // POST board-seen on mount when needed (latched).
  useEffect(() => {
    if (!data) return;
    if (!data.board_seen && !boardSeenFired.current) {
      boardSeenFired.current = true;
      markBoardSeen.mutate();
    }
  }, [data, markBoardSeen]);

  // Dismiss earn moment: POST seen for this slug, advance queue.
  const handleEarnDismiss = useCallback(() => {
    const current = earnQueue[0];
    if (!current) return;
    markSeen.mutate([current.slug]);
    setEarnQueue((q) => q.slice(1));
  }, [earnQueue, markSeen]);

  // "Share it" from earn moment: open share card, also mark seen.
  const handleEarnShare = useCallback(() => {
    const current = earnQueue[0];
    if (!current) return;
    setShareTarget(current);
    markSeen.mutate([current.slug]);
    setEarnQueue((q) => q.slice(1));
  }, [earnQueue, markSeen]);

  if (isLoading) {
    return (
      <CustomerShell title={t("patch.title")} hideChromeTitle>
        <div className="min-h-[100dvh] bg-cream flex items-center justify-center">
          <span className="text-subtle text-sm font-sans">{t("common.loading")}</span>
        </div>
      </CustomerShell>
    );
  }

  if (isError || !data) {
    return (
      <CustomerShell title={t("patch.title")} hideChromeTitle>
        <div className="min-h-[100dvh] bg-cream flex items-center justify-center">
          <span className="text-subtle text-sm font-sans">{t("common.error")}</span>
        </div>
      </CustomerShell>
    );
  }

  const currentEarnPatch = earnQueue[0] ?? null;

  return (
    <CustomerShell title={t("patch.title")} hideChromeTitle>
      {/* Earn moment overlay — one at a time, queued */}
      {currentEarnPatch && (
        <EarnMoment
          patch={currentEarnPatch}
          onKeep={handleEarnDismiss}
          onShare={handleEarnShare}
        />
      )}

      {/* Share card overlay */}
      {shareTarget && (
        <ShareCard patch={shareTarget} onClose={() => setShareTarget(null)} />
      )}

      {/* Detail sheet */}
      <DetailSheet
        patch={sheetPatch}
        open={!!sheetPatch}
        onClose={() => setSheetPatch(null)}
        onShare={(p) => {
          setSheetPatch(null);
          setShareTarget(p);
        }}
      />

      <div className="min-h-[100dvh] bg-cream pb-24">
        {/* ---- Header ---- */}
        <div className="px-4 pt-6 pb-3">
          <p className="text-xs text-subtle uppercase tracking-widest font-sans mb-0.5">
            {t("patch.board.header")}
          </p>
          <h1 className="font-display font-bold text-2xl text-ink">
            {t("patch.subtitle")
              .replace("{earned}", String(data.earned_count))
              .replace("{total}", String(data.total))}
          </h1>
        </div>

        {/* ---- Next-patch track ---- */}
        <NextTrackCard next={data.next} />

        {/* ---- Kraft board canvas ---- */}
        <div
          className="mx-4 rounded-xl overflow-hidden relative bg-patch-board"
          style={{ padding: "16px 12px 20px" }}
        >
          {/* Washi-tape top-left corner accent */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 block w-14 h-5 rounded-br-xl opacity-50"
            style={{
              background: "rgba(194,94,60,.35)",
              transform: "rotate(-45deg) translate(-20px, -8px)",
              transformOrigin: "0 0",
            }}
          />
          {/* Washi-tape top-right corner accent */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 block w-14 h-5 rounded-bl-xl opacity-50"
            style={{
              background: "rgba(94,139,106,.35)",
              transform: "rotate(45deg) translate(20px, -8px)",
              transformOrigin: "100% 0",
            }}
          />

          {/* 3-col patch grid */}
          <div className="grid grid-cols-3 gap-x-2 gap-y-5">
            {data.patches.map((patch) => (
              <PatchGridItem
                key={patch.slug}
                patch={patch}
                onTap={() => setSheetPatch(patch)}
              />
            ))}
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
