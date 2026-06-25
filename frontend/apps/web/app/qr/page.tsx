"use client";

import { useMe, useMyQr, useRewards, useWallet, type RewardProgress } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useEffect, useRef, useState } from "react";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { InitialTile } from "../_components/kit";
import { ScanIcon } from "../_components/icons";
import { useRequireAuth } from "../_lib/auth";

/** Track counts from the previous poll to detect increments. */
function usePrevCounts(list: RewardProgress[] | undefined) {
  const ref = useRef<Record<string, number>>({});
  if (list) {
    list.forEach((p) => {
      if (!(p.id in ref.current)) ref.current[p.id] = p.current_count;
    });
  }
  return ref;
}

/** +996700000001 → +996 700 *** 01 */
function maskPhone(phone?: string) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length < 6) return phone;
  return `+${d.slice(0, 3)} ${d.slice(3, 6)} *** ${d.slice(-2)}`;
}

type StampToast = { programId: string; businessName: string; newCount: number; target: number };

/** Track wallet available count per business+reward to detect new banked vouchers. */
function usePrevWalletCounts(
  available: { business: { id: string }; reward: { id: string }; count: number }[] | undefined,
) {
  const ref = useRef<Record<string, number>>({});
  if (available) {
    available.forEach((item) => {
      const key = `${item.business.id}:${item.reward.id}`;
      if (!(key in ref.current)) ref.current[key] = item.count;
    });
  }
  return ref;
}

/** Track completed_count per program to detect card completions. */
function usePrevCompletedCounts(
  inProgress: RewardProgress[] | undefined,
) {
  // completed_count lives on the RewardProgress type only after the banking-rewards
  // backend ships; it is not in the current type definition. We track current_count
  // going to 0 (reset) as a proxy signal — when a stamp card resets to 0 after having
  // been at target, a voucher was banked.
  const ref = useRef<Record<string, number>>({});
  if (inProgress) {
    inProgress.forEach((p) => {
      if (!(p.id in ref.current)) ref.current[p.id] = p.current_count;
    });
  }
  return ref;
}

type EarnedToast = { key: string; businessName: string };

export default function MyQrPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  const me = useMe(isAuthenticated);
  const qr = useMyQr(isAuthenticated);
  const rewards = useRewards({ refetchInterval: 3000 });
  const wallet = useWallet({ refetchInterval: 3000 });

  const [stampToasts, setStampToasts] = useState<StampToast[]>([]);
  const [earnedToasts, setEarnedToasts] = useState<EarnedToast[]>([]);
  const [readyPrograms, setReadyPrograms] = useState<Set<string>>(new Set());
  const prevCounts = usePrevCounts(rewards.data);
  const prevWalletCounts = usePrevWalletCounts(wallet.data?.available);
  const prevInProgressCounts = usePrevCompletedCounts(rewards.data);

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

  // -- stamp toasts (existing) + card-reset (earn-banked) detection ----------
  useEffect(() => {
    if (!rewards.data) return;
    const newToasts: StampToast[] = [];
    const newEarned: EarnedToast[] = [];
    const nowReady = new Set<string>();
    rewards.data.forEach((p) => {
      const prev = prevCounts.current[p.id];
      const target = p.target_count ?? p.reward_program.required_count ?? 0;
      if (prev !== undefined && p.current_count > prev) {
        newToasts.push({
          programId: p.id,
          businessName: p.business.name || p.reward_program.title,
          newCount: p.current_count,
          target,
        });
      }
      // Detect card reset: prev was at (or above) target and is now 0 → a voucher was banked
      if (
        prev !== undefined &&
        target > 0 &&
        prev >= target &&
        p.current_count === 0
      ) {
        const key = `reset:${p.id}`;
        newEarned.push({ key, businessName: p.business.name || p.reward_program.title });
      }
      prevCounts.current[p.id] = p.current_count;
      prevInProgressCounts.current[p.id] = p.current_count;
      if (p.status === "unlocked") nowReady.add(p.id);
    });
    if (newToasts.length > 0) {
      setStampToasts((prev) => [...prev, ...newToasts]);
      newToasts.forEach((toast) => {
        setTimeout(() => {
          setStampToasts((prev) => prev.filter((x) => x.programId !== toast.programId));
        }, 5000);
      });
    }
    if (newEarned.length > 0) {
      setEarnedToasts((prev) => [...prev, ...newEarned]);
      newEarned.forEach((toast) => {
        setTimeout(() => {
          setEarnedToasts((prev) => prev.filter((x) => x.key !== toast.key));
        }, 6000);
      });
    }
    setReadyPrograms(nowReady);
  }, [rewards.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- wallet available-count change → banked voucher celebration ----------
  useEffect(() => {
    if (!wallet.data?.available) return;
    const newEarned: EarnedToast[] = [];
    wallet.data.available.forEach((item) => {
      const key = `${item.business.id}:${item.reward.id}`;
      const prev = prevWalletCounts.current[key];
      if (prev !== undefined && item.count > prev) {
        newEarned.push({ key: `wallet:${key}`, businessName: item.business.name });
      }
      prevWalletCounts.current[key] = item.count;
    });
    if (newEarned.length > 0) {
      setEarnedToasts((prev) => [...prev, ...newEarned]);
      newEarned.forEach((toast) => {
        setTimeout(() => {
          setEarnedToasts((prev) => prev.filter((x) => x.key !== toast.key));
        }, 6000);
      });
    }
  }, [wallet.data]); // eslint-disable-line react-hooks/exhaustive-deps

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

                {/* live stamp-added toasts */}
                {stampToasts.map((toast) => (
                  <div
                    key={toast.programId}
                    className="mt-4 w-full max-w-sm animate-[jqIn_.3s_ease] rounded-2xl border border-line bg-card px-4 py-3 shadow-card"
                  >
                    <p className="text-sm font-bold text-brand">{t("qr.stampAddedNow")}</p>
                    <p className="mt-0.5 text-xs text-subtle">
                      {toast.businessName}
                      {toast.target > 0 && (
                        <>
                          {" · "}
                          {t("collect.progress")
                            .replace("{count}", String(toast.newCount))
                            .replace("{total}", String(toast.target))}
                        </>
                      )}
                    </p>
                  </div>
                ))}

                {/* reward-earned (banked) celebration toasts */}
                {earnedToasts.map((toast) => (
                  <div
                    key={toast.key}
                    className="mt-4 w-full max-w-sm animate-[jqIn_.3s_ease] rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 shadow-card"
                  >
                    <p className="text-sm font-bold text-amber-700">
                      🎁 {t("rewards.earned")} · {t("rewards.earnedBanked")}
                    </p>
                    {toast.businessName && (
                      <p className="mt-0.5 text-xs text-subtle">{toast.businessName}</p>
                    )}
                  </div>
                ))}

                {/* reward-ready banners (existing) */}
                {Array.from(readyPrograms).map((progId) => {
                  const p = rewards.data?.find((r) => r.id === progId);
                  if (!p) return null;
                  return (
                    <div
                      key={progId}
                      className="mt-4 w-full max-w-sm rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 shadow-card"
                    >
                      <p className="text-sm font-bold text-amber-700">{t("qr.rewardReady")}</p>
                      <p className="mt-0.5 text-xs text-subtle">
                        {p.business.name || p.reward_program.title} · {p.reward_program.reward_description}
                      </p>
                    </div>
                  );
                })}

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
