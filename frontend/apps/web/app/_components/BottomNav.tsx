"use client";

import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { FlagIcon, GiftIcon, HomeIcon, PinIcon, ScanIcon, UserIcon } from "./icons";

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
    Icon: GiftIcon,
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

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const t = useT();
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${
        active ? "text-brand" : "text-subtle"
      }`}
    >
      <item.Icon className="h-[22px] w-[22px]" />
      {t(item.key)}
    </Link>
  );
}

// Mobile bottom bar: Home · Loyalty · [Scan center] · Campaigns · Profile. The
// scan control is a raised center button in the bar itself (campaigns-restructure
// design §6) rather than a separate floating FAB.
export function BottomNav() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end border-t border-line bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {LEFT_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} active={item.match(pathname)} />
      ))}
      {/* raised center scan button */}
      <div className="relative flex min-h-[58px] justify-center">
        <Link
          href="/qr"
          aria-label={t("nav.scan")}
          className="absolute -top-8 left-1/2 z-10 flex h-[60px] w-[60px] -translate-x-1/2 items-center justify-center rounded-full bg-brand-gradient text-brand-fg shadow-[0_12px_28px_-7px_rgba(194,94,60,.75),0_0_24px_rgba(231,162,62,.28)] ring-[6px] ring-cream/95 transition hover:-translate-y-0.5 active:scale-95"
        >
          <span className="absolute inset-1 rounded-full border border-white/20" aria-hidden="true" />
          <ScanIcon className="relative h-7 w-7" />
        </Link>
        <span className="mt-auto pb-2 text-[11px] font-medium text-brand">{t("nav.scan")}</span>
      </div>
      {RIGHT_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} active={item.match(pathname)} />
      ))}
    </nav>
  );
}
