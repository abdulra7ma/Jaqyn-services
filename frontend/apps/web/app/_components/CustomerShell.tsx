"use client";

import { useMe } from "@jaqyn/api";
import { useI18n, useT, type Locale } from "@jaqyn/i18n";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../_lib/auth";
import { BottomNav, CUSTOMER_NAV } from "./BottomNav";
import { ScanFab } from "./ScanFab";
import { ScanIcon } from "./icons";

/**
 * Page chrome for customer screens. Responsive, mirroring the business OwnerShell:
 * desktop (lg+) gets a left sidebar + main panel; mobile keeps a top header + bottom nav.
 * All navigation chrome is shown to signed-in customers only.
 */
export function CustomerShell({
  title,
  back,
  showNav = true,
  hideChromeTitle = false,
  children,
}: {
  title: string;
  back?: string;
  showNav?: boolean;
  /** When the page renders its own hero title, suppress the chrome title to avoid duplication. */
  hideChromeTitle?: boolean;
  children: ReactNode;
}) {
  const { isAuthenticated, ready } = useAuth();
  // The desktop sidebar always stays for signed-in users, on every page (incl. detail
  // pages). `showNav` only governs the MOBILE bottom nav — the mobile back-arrow pattern.
  const sidebar = ready && isAuthenticated;
  const mobileNav = showNav && sidebar;
  // Desktop header is rendered when there's something to show: a title or a back affordance.
  const showDesktopHeader = sidebar && (!hideChromeTitle || !!back);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-cream font-sans text-ink lg:h-screen lg:flex-row">
      {/* sidebar — desktop, signed-in only */}
      {sidebar && <DesktopSidebar />}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* header — mobile (and any non-authed page) */}
        <header
          className={`sticky top-0 z-10 flex items-center justify-between gap-2 bg-cream px-4 py-3 ${sidebar ? "lg:hidden" : ""}`}
        >
          <div className="flex items-center gap-2">
            {back && (
              <Link href={back} aria-label="back" className="text-subtle hover:text-brand">
                ←
              </Link>
            )}
            {!hideChromeTitle && <h1 className="text-lg font-semibold text-brand">{title}</h1>}
          </div>
        </header>

        {/* header — desktop */}
        {showDesktopHeader && (
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
            {!hideChromeTitle && <h1 className="font-display text-[22px] font-bold text-ink">{title}</h1>}
          </header>
        )}

        <main
          className={`flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-10 lg:py-8 ${
            mobileNav ? "pb-24 lg:pb-8" : ""
          }`}
        >
          <div className="mx-auto w-full max-w-2xl">{children}</div>
        </main>
      </div>

      {/* bottom nav + scan FAB — mobile, signed-in only */}
      {mobileNav && (
        <>
          <ScanFab />
          <BottomNav />
        </>
      )}
    </div>
  );
}

function DesktopSidebar() {
  const t = useT();
  const pathname = usePathname();

  return (
    <aside className="hidden w-[244px] flex-none flex-col border-r border-line bg-card px-4 py-6 lg:flex">
      {/* logo */}
      <div className="flex items-center gap-2.5 px-1.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand-gradient font-display text-xl font-extrabold text-brand-fg shadow-glow">
          J
        </div>
        <div className="font-display text-[18px] font-bold text-ink">Jaqyn</div>
      </div>

      {/* primary action: show QR to collect */}
      <Link
        href="/collect"
        className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-brand-gradient py-3 text-sm font-bold text-brand-fg shadow-glow transition active:scale-[0.99]"
      >
        <ScanIcon className="h-5 w-5" />
        {t("collect.title")}
      </Link>

      {/* nav */}
      <nav className="mt-5 flex flex-col gap-1">
        {CUSTOMER_NAV.map(({ href, key, Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-sm font-semibold transition ${
                active ? "bg-brand-muted text-brand" : "text-subtle hover:bg-board/40 hover:text-ink"
              }`}
            >
              <Icon className="h-[20px] w-[20px]" />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      {/* footer */}
      <AccountCard />
    </aside>
  );
}

/** Account menu in the sidebar footer — mirrors the business OwnerCard pattern. */
function AccountCard() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  const { logout } = useAuth();
  const me = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const name = me.data?.user.name || me.data?.user.phone || t("account.role");
  const initial = (me.data?.user.name?.charAt(0) || "J").toUpperCase();

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <div ref={ref} className="relative mt-auto pt-4">
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-[14px] border border-line bg-card p-1.5 shadow-card">
          {/* language */}
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-subtle">
            {t("common.language")}
          </div>
          <div className="flex gap-1 px-1.5 pb-1.5">
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
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-[14px] p-2.5 transition ${
          open ? "bg-board/60" : "hover:bg-board/40"
        }`}
      >
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-gradient font-display text-sm font-bold text-brand-fg">
          {initial}
        </div>
        <div className="min-w-0 text-left">
          <div className="truncate text-[13.5px] font-semibold text-ink">{name}</div>
          <div className="text-[11.5px] text-subtle">{t("account.role")}</div>
        </div>
        <span className={`ml-auto flex-none text-subtle transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
    </div>
  );
}
