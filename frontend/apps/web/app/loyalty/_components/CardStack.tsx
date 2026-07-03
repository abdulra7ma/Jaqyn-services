"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { WalletShopCard } from "../_lib/wallet";
import { WalletCard } from "./WalletCard";

/**
 * Stack geometry — ported from the standalone demo's `renderVals()`. Each card
 * behind the top sits a little lower and smaller; only the first few are drawn.
 * The ±58px drag threshold (open up / dismiss down) matches the demo exactly.
 */
const RENDER = {
  offsetY: 46, // reveals each rear card's logo, name, and status pill like a physical wallet
  scaleStep: 0.05, // pronounced wallet perspective: every card narrows toward the back
  visible: 5, // a full wallet fan, matching the reference stack
  threshold: 58, // px drag distance to trigger open (up) / send-to-back (down)
  cardHeight: 210, // bank-card-like face; the exposed headers create the stack depth
  snapSettleMs: 180, // lets dragSnapToOrigin finish before the stack spring changes targets
} as const;

/**
 * The card-wallet stack: last-used on top, drag the top card up to open its
 * detail sheet, drag down to send it to the back (others cascade up), or tap a
 * card behind to pop it to the top. Honors `prefers-reduced-motion` (snaps, no
 * spring).
 */
export function CardStack({
  cards,
  onOpen,
}: {
  cards: WalletShopCard[];
  onOpen: (card: WalletShopCard) => void;
}) {
  const reduce = useReducedMotion();
  // Display order: order[0] is the top card. Indices into `cards`.
  const [order, setOrder] = useState(() =>
    cards
      .map((_, i) => i)
      .sort((a, b) => Number(cards[b]?.ready) - Number(cards[a]?.ready)),
  );
  const [rotating, setRotating] = useState(false);
  const rotateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didDrag = useRef(false);

  useEffect(
    () => () => {
      if (rotateTimer.current) clearTimeout(rotateTimer.current);
    },
    [],
  );

  // ponytail: re-sync order if the card list length changes (refetch added/
  // removed a shop). Cheap reset; fine-grained diffing isn't worth it here.
  if (order.length !== cards.length) {
    setOrder(cards.map((_, i) => i));
  }

  const spring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 520, damping: 38 };

  const sendToBack = (): void => setOrder((o) => [...o.slice(1), o[0]!]);
  const settleThenSendToBack = (): void => {
    if (reduce) {
      sendToBack();
      return;
    }
    setRotating(true);
    rotateTimer.current = setTimeout(() => {
      sendToBack();
      setRotating(false);
      rotateTimer.current = null;
    }, RENDER.snapSettleMs);
  };
  const bringToFront = (pos: number): void =>
    setOrder((o) => [o[pos]!, ...o.slice(0, pos), ...o.slice(pos + 1)]);

  // Deepest drawn card. The front card (pos 0) sits lowest and full-size; cards
  // behind fan UPWARD, each peeking `offsetY` above the one in front, so a
  // multi-card wallet reads as a physical stack instead of a single card.
  const maxDepth = Math.min(RENDER.visible - 1, cards.length - 1);

  return (
    <div
      className="relative mx-auto w-full max-w-sm"
      style={{ height: RENDER.cardHeight + maxDepth * RENDER.offsetY + 16 }}
    >
      {order.map((cardIdx, pos) => {
        const card = cards[cardIdx]!;
        const isTop = pos === 0;
        const depth = Math.min(pos, maxDepth);
        const hidden = pos > maxDepth;
        return (
          <motion.div
            key={card.businessId}
            transition={spring}
            className="absolute inset-x-0 top-0 origin-top rounded-modal shadow-modal"
            style={{ height: RENDER.cardHeight, zIndex: cards.length - pos }}
            animate={{
              y: (maxDepth - depth) * RENDER.offsetY,
              scale: 1 - depth * RENDER.scaleStep,
              opacity: hidden ? 0 : 1,
            }}
            whileTap={reduce || rotating ? undefined : { scale: 0.985 }}
            drag={isTop && !rotating ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.6}
            dragSnapToOrigin
            dragMomentum={false}
            onDragStart={() => {
              didDrag.current = true;
            }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -RENDER.threshold) onOpen(card);
              else if (info.offset.y > RENDER.threshold) settleThenSendToBack();
              setTimeout(() => {
                didDrag.current = false;
              }, 0);
            }}
            onClick={() => {
              if (didDrag.current || rotating) return;
              if (isTop) onOpen(card);
              else bringToFront(pos);
            }}
            role="button"
            tabIndex={hidden ? -1 : 0}
            aria-label={card.businessName}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (isTop) onOpen(card);
                else bringToFront(pos);
              }
            }}
          >
            <WalletCard card={card} />
          </motion.div>
        );
      })}
    </div>
  );
}
