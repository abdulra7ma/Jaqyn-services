"use client";

import { useMe, useMyQr } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useEffect } from "react";
import { InitialTile } from "./kit";
import { ScanIcon } from "./icons";
import { useSheetDrag } from "./useSheetDrag";

/** +996700000001 → +996 700 *** 01 */
function maskPhone(phone?: string) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length < 6) return phone;
  return `+${d.slice(0, 3)} ${d.slice(3, 6)} *** ${d.slice(-2)}`;
}

/**
 * Floating draggable QR sheet. Renders as a card that floats above the current
 * page with no backdrop dim — the live page content is visible behind it.
 * Drag the handle downward to dismiss; releasing with < 100 px delta snaps back.
 */
export function MyQrSheet({
  onClose,
  isAuthenticated,
}: {
  onClose: () => void;
  isAuthenticated: boolean;
}) {
  const t = useT();
  const me = useMe(isAuthenticated);
  const qr = useMyQr(isAuthenticated);
  const name = me.data?.user.name || me.data?.user.phone || "?";

  // Wake lock: keep screen on while QR is visible.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | undefined;
    (async () => {
      try {
        lock = await (
          navigator as unknown as {
            wakeLock?: { request: (t: string) => Promise<typeof lock> };
          }
        ).wakeLock?.request("screen");
      } catch {
        /* unsupported / denied */
      }
    })();
    return () => {
      void lock?.release().catch(() => {});
    };
  }, []);

  const { dragStyle, touchHandlers } = useSheetDrag(onClose);

  return (
    <div
      className="fixed inset-x-3 z-[80] rounded-[28px] bg-card shadow-[0_24px_60px_-12px_rgba(46,36,29,.4)]"
      style={{
        bottom: "env(safe-area-inset-bottom, 12px)",
        animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
        ...dragStyle,
      }}
      {...touchHandlers}
    >
      {/* drag handle */}
      <div className="flex justify-center pb-1 pt-3">
        <div className="h-1 w-12 rounded-full bg-line" />
      </div>

      {/* close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-board text-ink"
        aria-label={t("common.back")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="h-4 w-4" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <div className="px-5 pb-6 pt-1">
        {/* screen-brightened pill */}
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-amber/12 px-3 py-1.5 text-xs font-bold text-amber-deep">
            <span aria-hidden>☀</span>
            {t("qr.screenBrightened")}
          </span>
        </div>

        <div className="flex flex-col items-center">
          <InitialTile name={name} size={56} variant="gradient" />
          <h2 className="mt-2.5 font-display text-xl font-bold text-ink">{me.data?.user.name || ""}</h2>
          <p className="mt-0.5 text-sm text-subtle">{t("qr.showToEarn")}</p>

          {/* QR */}
          {qr.data ? (
            <div className="mt-4 rounded-[22px] bg-white p-4 shadow-[0_12px_32px_-8px_rgba(46,36,29,.28)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.data.png} alt="my QR" className="h-52 w-52" />
            </div>
          ) : (
            <div className="mt-4 flex h-[216px] w-[216px] items-center justify-center rounded-[22px] bg-board">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand" />
            </div>
          )}

          <p className="mt-3 text-sm text-subtle">
            {t("qr.member")} · {maskPhone(me.data?.user.phone ?? undefined)}
          </p>

          {/* download + share */}
          {qr.data && (
            <div className="mt-4 flex items-center gap-2.5">
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = qr.data!.png;
                  a.download = "jaqyn-qr.png";
                  a.click();
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-pill border border-line bg-card px-4 text-sm font-semibold text-ink"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" />
                </svg>
                {t("qr.download")}
              </button>
              <button
                onClick={async () => {
                  const nav = navigator as Navigator & {
                    canShare?: (d: ShareData) => boolean;
                    share?: (d: ShareData) => Promise<void>;
                  };
                  try {
                    const blob = await (await fetch(qr.data!.png)).blob();
                    const file = new File([blob], "jaqyn-qr.png", { type: blob.type || "image/png" });
                    if (nav.canShare?.({ files: [file] }) && nav.share) {
                      await nav.share({ files: [file], title: name, text: t("qr.showToEarn") });
                      return;
                    }
                    if (nav.share) {
                      await nav.share({ title: name, text: t("qr.showToEarn"), url: qr.data!.url });
                      return;
                    }
                    const a = document.createElement("a");
                    a.href = qr.data!.png;
                    a.download = "jaqyn-qr.png";
                    a.click();
                  } catch { /* user cancelled */ }
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-pill bg-brand-gradient px-4 text-sm font-bold text-brand-fg shadow-glow"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
                </svg>
                {t("qr.share")}
              </button>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 text-center text-xs font-semibold text-subtle">
            <ScanIcon className="h-4 w-4 flex-none" />
            <span>{t("qr.stampAtHint")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
