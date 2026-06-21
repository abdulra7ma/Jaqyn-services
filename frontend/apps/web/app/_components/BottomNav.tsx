"use client";

import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { FlagIcon, GiftIcon, HomeIcon, PinIcon, UserIcon, UsersIcon } from "./icons";

export type NavItem = {
  href: string;
  key: string;
  Icon: ComponentType<{ className?: string }>;
  match: (p: string) => boolean;
};

// Shared between the mobile bottom nav and the desktop sidebar (CustomerShell).
export const CUSTOMER_NAV: NavItem[] = [
  { href: "/", key: "nav.home", Icon: HomeIcon, match: (p) => p === "/" },
  { href: "/rewards", key: "nav.rewards", Icon: GiftIcon, match: (p) => p.startsWith("/rewards") },
  { href: "/group-offers", key: "nav.groups", Icon: UsersIcon, match: (p) => p.startsWith("/group") },
  { href: "/nearby", key: "nav.nearby", Icon: PinIcon, match: (p) => p.startsWith("/nearby") },
  { href: "/campaigns", key: "nav.campaigns", Icon: FlagIcon, match: (p) => p.startsWith("/campaigns") },
  { href: "/profile", key: "nav.profile", Icon: UserIcon, match: (p) => p.startsWith("/profile") },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {CUSTOMER_NAV.map(({ href, key, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-1 py-2 text-[11px] font-medium ${
              active ? "text-brand" : "text-subtle"
            }`}
          >
            <Icon className="h-[22px] w-[22px]" />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
