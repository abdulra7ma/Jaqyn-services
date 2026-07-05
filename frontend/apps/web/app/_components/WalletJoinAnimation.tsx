"use client";

import { WALLET_CARD_ADDED_EVENT } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { WalletIcon } from "./icons";

type WalletCardAddedDetail = {
  businessName: string;
  logoUrl: string | null;
};

type Flight = WalletCardAddedDetail & {
  id: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  temporaryTarget: boolean;
};

const FLIGHT_DURATION_MS = 1600;

export function WalletJoinAnimation() {
  const t = useT();
  const reduce = useReducedMotion() ?? false;
  const [flight, setFlight] = useState<Flight | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onCardAdded = (event: Event) => {
      const detail = (event as CustomEvent<WalletCardAddedDetail>).detail;
      if (!detail?.businessName) return;
      const targetRect = Array.from(
        document.querySelectorAll<HTMLElement>("[data-wallet-target='true']"),
      )
        .map((target) => target.getBoundingClientRect())
        .find((rect) => rect.width > 0 && rect.height > 0);
      const targetX = targetRect ? targetRect.left + targetRect.width / 2 - 28 : 70;
      const targetY = targetRect
        ? targetRect.top + targetRect.height / 2 - 34
        : window.innerHeight - 92;
      setFlight({
        ...detail,
        id: Date.now(),
        startX: window.innerWidth / 2 - 112,
        startY: window.innerHeight * 0.62,
        targetX,
        targetY,
        temporaryTarget: !targetRect,
      });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setFlight(null), reduce ? 1200 : FLIGHT_DURATION_MS);
    };
    window.addEventListener(WALLET_CARD_ADDED_EVENT, onCardAdded);
    return () => {
      window.removeEventListener(WALLET_CARD_ADDED_EVENT, onCardAdded);
      if (timer) clearTimeout(timer);
    };
  }, [reduce]);

  return (
    <AnimatePresence>
      {flight && (
        <div className="pointer-events-none fixed inset-0 z-[70]" aria-live="polite">
          {flight.temporaryTarget && !reduce && (
            <motion.span
              className="fixed flex h-14 w-14 items-center justify-center rounded-full border border-line bg-card text-brand shadow-glow"
              style={{ left: flight.targetX, top: flight.targetY }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1, 1.18, 1], opacity: 1 }}
              transition={{ duration: 1.35, times: [0, 0.2, 0.82, 1] }}
              aria-hidden
            >
              <WalletIcon className="h-6 w-6" />
            </motion.span>
          )}
          <motion.div
            className="fixed flex w-56 items-center gap-3 rounded-xl border border-line bg-card p-3 shadow-card"
            initial={
              reduce
                ? { x: flight.startX, y: flight.startY, opacity: 0 }
                : { x: flight.startX, y: flight.startY, scale: 0.9, opacity: 0 }
            }
            animate={
              reduce
                ? { opacity: [0, 1, 1, 0] }
                : {
                    x: [flight.startX, flight.startX, flight.targetX],
                    y: [flight.startY, flight.startY - 72, flight.targetY],
                    scale: [0.9, 1.05, 0.2],
                    opacity: [0, 1, 1, 0],
                  }
            }
            transition={
              reduce
                ? { duration: 1.1, times: [0, 0.12, 0.78, 1] }
                : { duration: 1.45, times: [0, 0.22, 0.68, 1], ease: "easeInOut" }
            }
            role="status"
          >
            {flight.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={flight.logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
            ) : (
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-tile font-display font-bold text-brand"
                aria-hidden
              >
                {flight.businessName.slice(0, 1)}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-ink">
                {flight.businessName}
              </span>
              <span className="block text-xs font-semibold text-sage">
                {t("wallet.cardAdded")}
              </span>
            </span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
