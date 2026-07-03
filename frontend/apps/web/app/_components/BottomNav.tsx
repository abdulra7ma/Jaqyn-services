"use client";

import { useT } from "@jaqyn/i18n";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { FlagIcon, HomeIcon, PinIcon, ScanIcon, UserIcon, WalletIcon } from "./icons";
import { useQrSheet } from "./QrSheet";

export type NavItem = {
  href: string;
  key: string;
  Icon: ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
};

// Desktop sidebar nav (CustomerShell). The mobile bottom bar is a curated 5-slot
// layout (see BottomNav) with a raised center Scan button, so it is built
// separately. Groups is gone — group campaigns live inside the Campaigns feed.
export const CUSTOMER_NAV: NavItem[] = [
  { href: "/", key: "nav.home", Icon: HomeIcon, match: (p) => p === "/" },
  // Loyalty is the durable-card surface; Rewards is reached from header wallet buttons.
  {
    href: "/loyalty",
    key: "nav.loyalty",
    Icon: WalletIcon,
    match: (p) => p.startsWith("/loyalty"),
  },
  {
    href: "/campaigns",
    key: "nav.campaigns",
    Icon: FlagIcon,
    match: (p) => p.startsWith("/campaigns"),
  },
  { href: "/nearby", key: "nav.nearby", Icon: PinIcon, match: (p) => p.startsWith("/nearby") },
  { href: "/profile", key: "nav.profile", Icon: UserIcon, match: (p) => p.startsWith("/profile") },
];

// The two nav items shown on each side of the raised center Scan button, in order.
const LEFT_ITEMS: NavItem[] = [CUSTOMER_NAV[0]!, CUSTOMER_NAV[1]!];
const RIGHT_ITEMS: NavItem[] = [CUSTOMER_NAV[2]!, CUSTOMER_NAV[4]!];

function NavLink({ item, active, reduce }: { item: NavItem; active: boolean; reduce: boolean }) {
  const t = useT();
  // Icon-only: the label is the accessible name via aria-label (no visible text).
  return (
    <Link
      href={item.href}
      aria-label={t(item.key)}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center justify-center py-3 ${
        active ? "text-brand" : "text-subtle"
      }`}
    >
      <span className="relative flex h-[38px] w-[38px] items-center justify-center">
        {/* Animated active indicator — a soft pill that glides between slots via
            a shared layoutId. `prefers-reduced-motion` makes it jump instantly. */}
        {active && (
          <motion.span
            layoutId="nav-active-pill"
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
            className="absolute inset-0 rounded-full bg-brand/12"
            aria-hidden
          />
        )}
        <motion.span whileTap={{ scale: 0.86 }} className="relative">
          <item.Icon className="h-[23px] w-[23px]" />
        </motion.span>
      </span>
    </Link>
  );
}

// Mobile bottom bar: a floating pill — Home · Loyalty · [Scan center] ·
// Campaigns · Profile — with a raised center Scan button (campaigns-restructure
// design §6) and an animated active indicator that glides between slots.
export function BottomNav() {
  const pathname = usePathname();
  const t = useT();
  const { openQr } = useQrSheet();
  const reduce = useReducedMotion() ?? false;
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),12px)] lg:hidden">
      <div className="pointer-events-auto grid w-full max-w-sm grid-cols-5 items-end rounded-pill border border-line bg-card/95 px-2 shadow-card backdrop-blur">
        {LEFT_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} reduce={reduce} />
        ))}
        {/* raised center scan button (icon only) */}
        <div className="relative flex min-h-[58px] justify-center">
          <motion.button
            type="button"
            onClick={openQr}
            aria-label={t("nav.scan")}
            whileTap={{ scale: 0.92 }}
            className="absolute -top-5 left-1/2 z-10 flex h-[60px] w-[60px] -translate-x-1/2 items-center justify-center rounded-full bg-brand-gradient text-brand-fg shadow-[0_12px_28px_-7px_rgba(194,94,60,.75),0_0_24px_rgba(231,162,62,.28)] ring-[6px] ring-card/95 transition hover:-translate-y-0.5"
          >
            <span className="absolute inset-1 rounded-full border border-white/20" aria-hidden="true" />
            <ScanIcon className="relative h-7 w-7" />
          </motion.button>
        </div>
        {RIGHT_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={item.match(pathname)} reduce={reduce} />
        ))}
      </div>
    </nav>
  );
}
