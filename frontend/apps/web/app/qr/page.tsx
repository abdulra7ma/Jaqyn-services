"use client";

import { useMe, useMyQr } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useEffect } from "react";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { InitialTile } from "../_components/kit";
import { ScanIcon } from "../_components/icons";
import { useRequireAuth } from "../_lib/auth";

/** +996700000001 → +996 700 *** 01 */
function maskPhone(phone?: string) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length < 6) return phone;
  return `+${d.slice(0, 3)} ${d.slice(3, 6)} *** ${d.slice(-2)}`;
}

export default function MyQrPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  const me = useMe(isAuthenticated);
  const qr = useMyQr(isAuthenticated);

  // Keep the screen awake while the QR is shown so staff can scan it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | undefined;
    (async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request("screen");
      } catch {
        /* wake lock unsupported / denied — the pill is still shown */
      }
    })();
    return () => {
      void lock?.release().catch(() => {});
    };
  }, []);

  const name = me.data?.user.name || me.data?.user.phone || "?";

  return (
    <CustomerShell title={t("qr.myQrTitle")} back="/" showNav={false} hideChromeTitle>
      {!isAuthenticated ? null : (
        <QueryBoundary query={qr}>
          {(data) => {
            function downloadQr() {
              const a = document.createElement("a");
              a.href = data.png;
              a.download = "jaqyn-qr.png";
              a.click();
            }
            async function shareQr() {
              const nav = navigator as Navigator & {
                canShare?: (d: ShareData) => boolean;
                share?: (d: ShareData) => Promise<void>;
              };
              try {
                const blob = await (await fetch(data.png)).blob();
                const file = new File([blob], "jaqyn-qr.png", { type: blob.type || "image/png" });
                if (nav.canShare?.({ files: [file] }) && nav.share) {
                  await nav.share({ files: [file], title: name, text: t("qr.showToEarn") });
                  return;
                }
                if (nav.share) {
                  await nav.share({ title: name, text: t("qr.showToEarn"), url: data.url });
                  return;
                }
                downloadQr();
              } catch {
                /* user cancelled the share sheet */
              }
            }

            return (
              <div className="flex min-h-[78dvh] flex-col items-center">
                {/* screen-brightened pill */}
                <div className="flex w-full justify-end">
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-amber/12 px-3 py-1.5 text-xs font-bold text-amber-deep">
                    <span aria-hidden>☀</span>
                    {t("qr.screenBrightened")}
                  </span>
                </div>

                {/* avatar + name + subtitle */}
                <InitialTile name={name} size={64} variant="gradient" />
                <h1 className="mt-3 font-display text-2xl font-bold text-ink">{me.data?.user.name || ""}</h1>
                <p className="mt-1 text-sm text-subtle">{t("qr.showToEarn")}</p>

                {/* QR */}
                <div className="mt-5 rounded-[28px] bg-card p-5 shadow-[0_18px_40px_-18px_rgba(46,36,29,.4)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.png} alt="my QR" className="h-60 w-60" />
                </div>

                {/* member line */}
                <p className="mt-4 text-sm text-subtle">
                  {t("qr.member")} · {maskPhone(me.data?.user.phone ?? undefined)}
                </p>

                {/* download + share */}
                <div className="mt-5 flex items-center gap-2.5">
                  <button
                    onClick={downloadQr}
                    className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-line bg-card px-5 text-sm font-semibold text-ink transition hover:bg-board/40"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                      <path d="M12 3v12" />
                      <path d="m7 11 5 5 5-5" />
                      <path d="M5 21h14" />
                    </svg>
                    {t("qr.download")}
                  </button>
                  <button
                    onClick={shareQr}
                    className="inline-flex min-h-11 items-center gap-2 rounded-pill bg-brand-gradient px-5 text-sm font-bold text-brand-fg shadow-glow transition active:scale-[0.99]"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
                    </svg>
                    {t("qr.share")}
                  </button>
                </div>

                {/* footer hint */}
                <div className="mt-auto flex items-center gap-2 pt-8 text-center text-xs font-semibold text-subtle">
                  <ScanIcon className="h-4 w-4 flex-none" />
                  <span>{t("qr.stampAtHint")}</span>
                </div>
              </div>
            );
          }}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}
