"use client";

import { staffApi, useMe } from "@jaqyn/api";
import { useI18n, useT, type Locale } from "@jaqyn/i18n";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { InitialTile, UserAvatar } from "../../_components/kit";
import { useRequireArea } from "../../_lib/auth";
import { useStaffAuth } from "../_lib/staffAuth";
import { STAFF_TABS, StaffNav } from "./StaffNav";

// Desktop sidebar excludes Scan — scanning is a mobile (cashier-device) action only.
const DESKTOP_TABS = STAFF_TABS.filter((tab) => tab.href !== "/staff/scan");

export function StaffShell({
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
  const { staff } = useStaffAuth();
  const { allowed } = useRequireArea("staff");

  if (!allowed) return null;

  // Login / chrome-less screens: minimal header only, no nav.
  if (!showNav) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-cream">
        <header className="sticky top-0 z-10 flex items-center gap-2 bg-cream px-5 py-4">
          {back && (
            <Link href={back} aria-label="back" className="text-subtle hover:text-brand">
              ←
            </Link>
          )}
          <h1 className="font-display text-lg font-bold text-ink">{title}</h1>
        </header>
        <main className="flex-1 px-5 pb-8">{children}</main>
      </div>
    );
  }

  const businessName = staff?.business_name ?? title;
  const role = staff?.role ?? "cashier";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream font-sans text-ink lg:h-screen lg:flex-row">
      {/* Sidebar — desktop only */}
      <StaffSidebar businessName={businessName} role={role} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Business header — mobile */}
        <header className="flex items-center justify-between gap-3 px-5 pb-1 pt-3 lg:hidden">
          <div className="flex items-center gap-3">
            <InitialTile name={businessName} size={42} variant="gradient" />
            <div>
              <div className="font-display text-base font-bold text-ink">{businessName}</div>
              <div className="text-xs text-subtle">
                {t("staff.staffMode")} · {t(`staff.role.${role}`)}
              </div>
            </div>
          </div>
          <span className="rounded-pill bg-amber/15 px-2.5 py-1 text-[11px] font-bold text-amber-deep">
            {t("staff.badge")}
          </span>
        </header>

        {/* Title header — desktop */}
        <header className="hidden items-center gap-3 border-b border-line bg-cream px-8 py-5 lg:flex">
          {back && (
            <Link
              href={back}
              aria-label="back"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card text-subtle transition hover:border-brand hover:text-brand"
            >
              ←
            </Link>
          )}
          <h1 className="font-display text-[22px] font-bold text-ink">{title}</h1>
        </header>

        <main className="flex-1 overflow-y-auto px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] pt-5 lg:px-10 lg:pb-8 lg:pt-8">
          <div className="mx-auto w-full max-w-2xl">{children}</div>
        </main>
      </div>

      {/* Bottom nav — mobile only (hidden on lg via StaffNav's own class) */}
      <StaffNav />
    </div>
  );
}

function StaffSidebar({ businessName, role }: { businessName: string; role: string }) {
  const t = useT();
  const pathname = usePathname();

  return (
    <aside className="hidden w-[244px] flex-none flex-col border-r border-line bg-card px-4 py-6 lg:flex">
      {/* business header */}
      <div className="flex items-center gap-2.5 px-1.5">
        <InitialTile name={businessName} size={40} variant="gradient" />
        <div className="min-w-0">
          <div className="truncate font-display text-[16px] font-bold text-ink">{businessName}</div>
          <div className="text-[11.5px] text-subtle">{t(`staff.role.${role}`)}</div>
        </div>
      </div>

      {/* nav — Activity / Profile (no Scan on desktop) */}
      <nav className="mt-6 flex flex-col gap-1">
        {DESKTOP_TABS.map(({ href, key, icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-sm font-semibold transition ${
                active ? "bg-brand-muted text-brand" : "text-subtle hover:bg-board/40 hover:text-ink"
              }`}
            >
              <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
              {t(key)}
            </Link>
          );
        })}
      </nav>

      <StaffAccountFooter />
    </aside>
  );
}

/** Sidebar footer — language + logout, mirroring the customer/business AccountCard. */
function StaffAccountFooter() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  const me = useMe();
  const user = me.data?.user;

  function signOut() {
    staffApi.logout();
    router.replace("/staff/login");
  }

  return (
    <div className="mt-auto pt-4">
      {user && (
        <Link
          href="/staff/profile"
          className="mb-2 flex items-center gap-2.5 rounded-[12px] p-2 transition hover:bg-board/40"
        >
          <UserAvatar user={user} size={34} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-ink">
              {user.name || user.phone}
            </div>
            <div className="text-[11px] text-subtle">{t("staff.tab.profile")}</div>
          </div>
        </Link>
      )}
      <div className="px-2.5 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-subtle">
        {t("common.language")}
      </div>
      <div className="flex gap-1 px-1.5 pb-2">
        {(["ru", "en"] as Locale[]).map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`flex-1 rounded-[9px] py-1.5 text-xs font-bold transition ${
              locale === l ? "bg-brand-muted text-brand" : "text-subtle hover:bg-board/50"
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="my-1 h-px bg-line" />
      <button
        onClick={signOut}
        className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left text-[13px] font-semibold text-brand hover:bg-board/40"
      >
        <span className="w-[18px] text-center">⏻</span>
        {t("auth.logout")}
      </button>
    </div>
  );
}
