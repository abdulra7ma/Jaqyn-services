"use client";

import type { LoyaltyCardView } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { buildWallet, type WalletShopCard } from "../_lib/wallet";
import { WalletDetailSheet } from "./WalletDetailSheet";

// Drag-heavy, client-only views. Dynamic-imported with ssr:false so
// framer-motion stays out of the initial server bundle (same rule as the QR
// scanner). A plain skeleton holds the box height while they load.
const skeleton = (
  <div className="mx-auto h-[240px] w-full max-w-sm animate-pulse rounded-modal bg-board" />
);
const CardStack = dynamic(() => import("./CardStack").then((m) => m.CardStack), {
  ssr: false,
  loading: () => skeleton,
});
const CardCarousel = dynamic(() => import("./CardCarousel").then((m) => m.CardCarousel), {
  ssr: false,
  loading: () => skeleton,
});

type View = "stack" | "slides";

/** Segmented control (design-system §6): white tray, accent thumb. */
function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const t = useT();
  const opts: { id: View; key: string }[] = [
    { id: "stack", key: "cmp.wallet.view.stack" },
    { id: "slides", key: "cmp.wallet.view.slides" },
  ];
  return (
    <div className="ml-auto flex w-fit gap-1 rounded-[13px] bg-card p-1.5 shadow-card" role="tablist">
      {opts.map((o) => {
        const active = view === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "rounded-[9px] px-4 py-1.5 text-[13px] font-bold transition",
              active ? "bg-brand text-brand-fg" : "text-subtle active:scale-[.98]",
            )}
          >
            {t(o.key as Parameters<typeof t>[0])}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The physical card wallet: a Stack/Slides toggle over the loyalty cards, with a
 * shared detail sheet. View choice is ephemeral UI state (not persisted). The
 * card list is grouped per shop once via `buildWallet`.
 */
export function Wallet({ cards }: { cards: LoyaltyCardView[] }) {
  const shops = useMemo(() => buildWallet(cards), [cards]);
  const [view, setView] = useState<View>("stack");
  const [selected, setSelected] = useState<WalletShopCard | null>(null);

  return (
    <div className="mt-6">
      <ViewToggle view={view} onChange={setView} />
      {/* Center the cards in the screen's mid-region (matches the demo). */}
      <div className="mt-8 flex min-h-[50vh] items-center justify-center">
        {view === "stack" ? (
          <CardStack cards={shops} onOpen={setSelected} />
        ) : (
          <CardCarousel cards={shops} onOpen={setSelected} />
        )}
      </div>
      <WalletDetailSheet card={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
