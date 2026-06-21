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
        <rect x="3" y="3" width="5" height="5" rx="1" />
        <rect x="16" y="3" width="5" height="5" rx="1" />
        <rect x="3" y="16" width="5" height="5" rx="1" />
        <path d="M16 16h5v5M16 16v5" />
        <path d="M11 3v2M11 8v2M3 11h2M8 11h2M11 11h2M11 16v2M11 21h2M16 11h2M21 11v2" />
      </svg>
    ),
  },
  {
    href: "/staff/groups",
    key: "staff.tab.groups",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
  {
    href: "/staff/activity",
    key: "staff.tab.activity",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 15" />
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

export function StaffNav({ theme = "light" }: { theme?: "light" | "dark" }) {
  const t = useT();
  const pathname = usePathname();

  const isDark = theme === "dark";

  return (
    <nav
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      className={[
        "fixed bottom-0 left-0 right-0 z-50 flex lg:hidden",
        isDark
          ? "border-t border-white/10 bg-ink/92 backdrop-blur-sm"
          : "border-t border-line bg-cream shadow-[0_-1px_0_0_rgba(0,0,0,.04)]",
      ].join(" ")}
    >
      {STAFF_TABS.map(({ href, key, icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={[
              "flex flex-1 flex-col items-center justify-center gap-1 py-3 text-[10.5px] font-bold tracking-[.04em] transition",
              active
                ? "text-brand"
                : isDark
                  ? "text-white/45 hover:text-white/70"
                  : "text-subtle hover:text-ink",
            ].join(" ")}
          >
            {icon}
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
