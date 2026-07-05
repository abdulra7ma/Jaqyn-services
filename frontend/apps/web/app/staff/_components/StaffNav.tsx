"use client";

import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const STAFF_TABS = [
  {
    href: "/staff/scan",
    key: "staff.tab.scan",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
        <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/staff/activity",
    key: "staff.tab.activity",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    href: "/staff/profile",
    key: "staff.tab.profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
] as const;

/** Floating icon-pill bottom nav — white pill, icon-only tabs, active in brand.
 *  `showOnDesktop` overrides the default `lg:hidden` so pages that render their
 *  own layout (e.g. staff/scan) can expose the nav at every viewport width. */
export function StaffNav({ showOnDesktop = false }: { showOnDesktop?: boolean }) {
  const t = useT();
  const pathname = usePathname();

  return (
    <nav
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      className={[
        "fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-pill bg-card px-3 py-2 shadow-modal",
        showOnDesktop ? "" : "lg:hidden",
      ].join(" ").trim()}
    >
      {STAFF_TABS.map(({ href, key, icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={t(key)}
            aria-current={active ? "page" : undefined}
            className={[
              "flex h-11 w-14 items-center justify-center rounded-pill transition",
              active ? "text-brand" : "text-subtle hover:text-ink",
            ].join(" ")}
          >
            {icon}
          </Link>
        );
      })}
    </nav>
  );
}
