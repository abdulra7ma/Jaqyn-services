"use client";

import { LanguageSwitch, useT } from "@jaqyn/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { ChartIcon, GiftIcon, MoreIcon, ScanIcon, UsersIcon } from "../../_components/icons";

const NAV: { href: string; key: string; Icon: ComponentType<{ className?: string }>; exact?: boolean }[] = [
  { href: "/business", key: "biz.nav.dashboard", Icon: ChartIcon, exact: true },
  { href: "/business/rewards", key: "biz.nav.rewards", Icon: GiftIcon },
  { href: "/business/offers", key: "biz.nav.offers", Icon: UsersIcon },
  { href: "/business/qr", key: "biz.nav.qr", Icon: ScanIcon },
  { href: "/business/more", key: "biz.nav.more", Icon: MoreIcon },
];

export function BusinessShell({
  title,
  back,
  showNav = true,
  children,
}: {
  title: string;
  back?: string;
  showNav?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col bg-cream">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-cream px-4 py-3">
        <div className="flex items-center gap-2">
          {back && (
            <Link href={back} aria-label="back" className="text-subtle hover:text-brand">
              ←
            </Link>
          )}
          <h1 className="text-lg font-semibold text-brand">{title}</h1>
        </div>
        <LanguageSwitch />
      </header>

      <main className="flex-1 p-4">{children}</main>

      {showNav && (
        <nav className="sticky bottom-0 z-10 grid grid-cols-5 border-t border-line bg-cream/90 backdrop-blur">
          {NAV.map(({ href, key, Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
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
      )}
    </div>
  );
}
