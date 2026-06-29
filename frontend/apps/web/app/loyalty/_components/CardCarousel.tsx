"use client";

import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "../../_components/icons";
import type { WalletShopCard } from "../_lib/wallet";
import { WalletCard } from "./WalletCard";

const SWIPE_THRESHOLD = 58; // px, matches the stack's open/dismiss threshold

/**
 * "Slides" mode: one card at a time, swipe left/right (drag past 58px), prev/next
 * arrows, and a dot indicator. Tapping the card opens its detail sheet. Honors
 * `prefers-reduced-motion` (no slide animation).
 */
export function CardCarousel({
  cards,
  onOpen,
}: {
  cards: WalletShopCard[];
  onOpen: (card: WalletShopCard) => void;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1); // slide direction for enter/exit
  const clamped = Math.min(index, cards.length - 1);
  const card = cards[clamped]!;

  const go = (next: number): void => {
    const bounded = Math.max(0, Math.min(cards.length - 1, next));
    setDir(bounded > clamped ? 1 : -1);
    setIndex(bounded);
  };

  const slide = reduce ? 0 : 1;

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="relative h-[240px] overflow-hidden">
        <AnimatePresence custom={dir} initial={false} mode="popLayout">
          <motion.div
            key={card.businessId}
            custom={dir}
            className="absolute inset-0 cursor-pointer"
            initial={{ x: slide * dir * 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: slide * -dir * 320, opacity: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              if (info.offset.x < -SWIPE_THRESHOLD) go(clamped + 1);
              else if (info.offset.x > SWIPE_THRESHOLD) go(clamped - 1);
            }}
            onClick={() => onOpen(card)}
            role="button"
            tabIndex={0}
            aria-label={card.businessName}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(card);
              } else if (e.key === "ArrowRight") go(clamped + 1);
              else if (e.key === "ArrowLeft") go(clamped - 1);
            }}
          >
            <WalletCard card={card} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => go(clamped - 1)}
          disabled={clamped === 0}
          aria-label={t("cmp.wallet.prev")}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-ink shadow-card transition active:scale-95 disabled:opacity-40"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2" aria-hidden>
          {cards.map((c, i) => (
            <span
              key={c.businessId}
              className={cn(
                "h-2 rounded-full transition-all",
                i === clamped ? "w-5 bg-brand" : "w-2 bg-board",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(clamped + 1)}
          disabled={clamped === cards.length - 1}
          aria-label={t("cmp.wallet.next")}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-ink shadow-card transition active:scale-95 disabled:opacity-40"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
