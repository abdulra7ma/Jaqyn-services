"use client";

import {
  useMe,
  useMyQr,
  usePresentRedemption,
  useWallet,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CustomerShell } from "../../../_components/CustomerShell";
import { QueryBoundary } from "../../../_components/QueryBoundary";
import { InitialTile } from "../../../_components/kit";
import { useRequireAuth } from "../../../_lib/auth";

// TTL in seconds (mirrors backend REWARD_PRESENT_TTL_SECONDS default)
const PRESENT_TTL = 120;

function useCountdown(expiresAt: string | null | undefined) {
  const [secs, setSecs] = useState<number>(() => {
    if (!expiresAt) return PRESENT_TTL;
    const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    return diff;
  });

  useEffect(() => {
    if (!expiresAt) {
      // Fall back to a local TTL countdown from mount
      const start = Date.now();
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        setSecs(Math.max(0, PRESENT_TTL - elapsed));
      }, 1000);
      return () => clearInterval(interval);
    }
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecs(diff);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return secs;
}

export default function PresentRedemptionPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useRequireAuth();
  const router = useRouter();

  const me = useMe(isAuthenticated);
  const qr = useMyQr(isAuthenticated);

  // -- 1. Fire present mutation on mount ---------------------------------
  const present = usePresentRedemption();
  const hasFired = useRef(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [rewardTitle, setRewardTitle] = useState<string>("");
  const [businessName, setBusinessName] = useState<string>("");
  const [presentError, setPresentError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || hasFired.current) return;
    hasFired.current = true;
    present.mutate(id, {
      onSuccess: (data) => {
        setExpiresAt(data.expires_at ?? null);
        setRewardTitle(data.reward_title ?? "");
        setBusinessName(data.business_name ?? "");
      },
      onError: () => {
        setPresentError(t("common.error"));
      },
    });
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- 2. Poll wallet to detect when this redemption is consumed ----------
  const wallet = useWallet({ refetchInterval: 3000 });
  const [done, setDone] = useState(false);
  const prevIdSet = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!wallet.data) return;
    // Collect all current redemption_ids in the wallet
    const currentIds = new Set(
      wallet.data.available.flatMap((w) => w.redemption_ids),
    );
    if (prevIdSet.current === null) {
      // First data snapshot — just record current state
      prevIdSet.current = currentIds;
      return;
    }
    // If this specific id is no longer present → it was redeemed
    if (!currentIds.has(id) && prevIdSet.current.has(id)) {
      setDone(true);
    }
    prevIdSet.current = currentIds;
  }, [wallet.data, id]);

  // -- 3. After "done", auto-navigate back to wallet ---------------------
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.replace("/rewards"), 3000);
    return () => clearTimeout(timer);
  }, [done, router]);

  // -- 4. Countdown -------------------------------------------------------
  const secs = useCountdown(expiresAt);
  const mins = Math.floor(secs / 60);
  const secPart = secs % 60;
  const countdown = `${mins}:${String(secPart).padStart(2, "0")}`;
  const timedOut = secs === 0;

  // -- render -------------------------------------------------------------
  const name = me.data?.user.name || me.data?.user.phone || "?";

  return (
    <CustomerShell
      title={rewardTitle || t("rewards.use")}
      back="/rewards"
      showNav={false}
    >
      {!isAuthenticated ? null : (
        <div className="flex flex-col items-center gap-5 pt-2 text-center">
          {/* Error presenting */}
          {presentError && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {presentError}
            </p>
          )}

          {/* ── Redeemed celebration ── */}
          {done ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="text-5xl">🎉</div>
              <p className="font-display text-2xl font-extrabold text-brand">
                {t("redeem.done")}
              </p>
              {rewardTitle && (
                <p className="text-sm text-subtle">{rewardTitle}</p>
              )}
              <p className="animate-pulse text-xs text-subtle">
                {t("common.loading")}
              </p>
            </div>
          ) : (
            <>
              {/* Reward badge */}
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-brand-gradient shadow-glow">
                  <span className="text-4xl">🎁</span>
                </div>
                {rewardTitle && (
                  <p className="font-display text-lg font-bold text-ink">{rewardTitle}</p>
                )}
                {businessName && (
                  <p className="text-sm text-subtle">{businessName}</p>
                )}
              </div>

              {/* "Ask staff" instruction */}
              <p className="max-w-[280px] text-sm text-subtle">{t("redeem.askStaff")}</p>

              {/* Personal QR */}
              <QueryBoundary query={qr}>
                {(qrData) => (
                  <div className="rounded-[24px] border border-line bg-cream p-4 shadow-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrData.png} alt="my QR" className="h-52 w-52" />
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <InitialTile
                        name={name}
                        variant="gradient"
                        size={28}
                      />
                      <p className="text-sm font-semibold text-ink">{name}</p>
                    </div>
                  </div>
                )}
              </QueryBoundary>

              {/* Countdown */}
              {!timedOut && (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-xs font-semibold text-subtle">{t("redeem.timer")}</p>
                  <p className="font-display text-2xl font-bold text-ink tabular-nums">
                    {countdown}
                  </p>
                </div>
              )}

              {timedOut && (
                <p className="text-xs font-semibold text-brand">
                  {t("redeem.presenting")}
                </p>
              )}

              {/* Pulsing waiting indicator */}
              <p className="animate-pulse text-xs font-semibold text-subtle">
                {t("redeem.waiting")}
              </p>
            </>
          )}
        </div>
      )}
    </CustomerShell>
  );
}
