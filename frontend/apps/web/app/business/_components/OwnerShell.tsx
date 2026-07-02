"use client";

// Business owner desktop shell, translated from the Jaqyn.dc.html design canvas
// (business owner area: dark sidebar nav + main panel). Responsive: the sidebar
// collapses to a top bar + slide-over drawer below `lg`.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBusinessMe, useMe } from "@jaqyn/api";
import { LOCALES, useI18n, useT, type Locale } from "@jaqyn/i18n";
import { UserAvatar } from "../../_components/kit";
import {
  ChartIcon,
  GiftIcon,
  GlobeIcon,
  GridIcon,
  MegaphoneIcon,
  ScanIcon,
  SettingsIcon,
  TicketIcon,
  UserIcon,
  UsersIcon,
} from "../../_components/icons";
import { useAuth, useRequireArea } from "../../_lib/auth";

type IconComponent = (props: { className?: string }) => React.JSX.Element;
type NavItem = { key: string; icon: IconComponent; href: string };
type NavSection = { key: string; items: NavItem[] };

// Grouped, outcome-first owner sidebar. No more
// Loyalty-program or Group-Deals items — loyalty is now an Individual campaign and
// Groups live inside a Group campaign's detail. "Rewards / Redemptions" is the
// voucher redemption-tracking view, not a loyalty builder. Labels via @jaqyn/i18n.
export const OWNER_NAV_SECTIONS: NavSection[] = [
  {
    // Dashboard stands alone at the top — no section label above it.
    key: "",
    items: [{ key: "owner.nav.dashboard", icon: GridIcon, href: "/business/dashboard" }],
  },
  {
    key: "owner.nav.section.programs",
    items: [
      { key: "owner.nav.campaigns", icon: MegaphoneIcon, href: "/business/campaigns" },
      { key: "owner.nav.loyalty", icon: GiftIcon, href: "/business/loyalty" },
    ],
  },
  {
    key: "owner.nav.section.engage",
    items: [
      { key: "owner.nav.qr", icon: ScanIcon, href: "/business/qr" },
      { key: "owner.nav.rewards", icon: TicketIcon, href: "/business/rewards" },
    ],
  },
  {
    key: "owner.nav.section.insights",
    items: [
      { key: "owner.nav.customers", icon: UsersIcon, href: "/business/customers" },
      { key: "owner.nav.analytics", icon: ChartIcon, href: "/business/reports" },
    ],
  },
  {
    key: "owner.nav.section.account",
    items: [
      { key: "owner.nav.staff", icon: UserIcon, href: "/business/staff" },
      { key: "owner.nav.settings", icon: SettingsIcon, href: "/business/profile" },
    ],
  },
];

export const OWNER_NAV = OWNER_NAV_SECTIONS.flatMap((section) => section.items);

const BIZ = { name: "Manas Coffee", cat: "Cafe", area: "Chuy Avenue", owner: "Nurlan A." };

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const t = useT();
  return (
    <nav className="flex flex-col gap-4">
      {OWNER_NAV_SECTIONS.map((section) => (
        <div key={section.key || section.items[0]!.href}>
          {section.key && (
            <div className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#7F7164]">
              {t(section.key)}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {section.items.map((n) => {
              const active = pathname === n.href || pathname.startsWith(n.href + "/");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-[13.5px] font-semibold transition ${
                    active
                      ? "bg-brand text-brand-fg shadow-[0_8px_20px_-12px_rgba(203,92,55,.8)]"
                      : "text-[#C9BCA8] hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <n.icon className="h-[18px] w-[18px] flex-none" />
                  {t(n.key)}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarLanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="mb-3 flex items-center gap-2 rounded-[12px] border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11.5px] font-semibold text-[#9F9183]">
      <GlobeIcon className="h-4 w-4 flex-none" />
      <span>{t("common.language")}</span>
      <select
        aria-label={t("common.language")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="ml-auto cursor-pointer bg-transparent text-[11.5px] font-bold text-[#E4D9CB] outline-none"
      >
        {LOCALES.map((item) => (
          <option key={item} value={item} className="bg-[#30251F] text-white">
            {t(`common.language.${item}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function OwnerCard() {
  const t = useT();
  const router = useRouter();
  const { logout } = useAuth();
  const me = useMe();
  const user = me.data?.user;
  const ownerName = user?.name || user?.phone || BIZ.owner;
  // Only show the "work as staff" switch when the owner actually holds a staff
  // seat (owner_is_staff toggle on → area granted). Otherwise it's a dead end.
  const canStaff = (me.data?.areas ?? []).includes("staff");
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

  function signOut() {
    logout();
    router.replace("/login?return=/business/dashboard");
  }

  return (
    <div ref={ref} className="relative mt-auto">
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-[14px] border border-white/10 bg-[#3A2E25] p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,.6)]">
          {canStaff && (
            <Link
              href="/staff"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13px] font-semibold text-board hover:bg-white/5"
            >
              <ScanIcon className="h-[18px] w-[18px] flex-none" />
              {t("owner.nav.staffMode")}
            </Link>
          )}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold text-[#E8A48C] hover:bg-white/5"
          >
            <span className="w-[18px] text-center text-[15px]">⏻</span>
            {t("owner.nav.logout")}
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full items-center gap-[11px] rounded-[14px] p-3.5 transition ${open ? "bg-white/10" : "bg-white/5 hover:bg-white/[0.08]"}`}
      >
        {user ? (
          <UserAvatar user={user} size={38} />
        ) : (
          <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-brand font-display text-[15px] font-bold text-brand-fg">
            {BIZ.owner.charAt(0)}
          </div>
        )}
        <div className="min-w-0 text-left">
          <div className="truncate text-[13.5px] font-semibold text-white">{ownerName}</div>
          <div className="text-[11.5px] text-[#9A8B7B]">{t("owner.role")}</div>
        </div>
        <span className={`ml-auto flex-none text-[#9A8B7B] transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
    </div>
  );
}

export function OwnerShell({ title, children }: { title: string; children: ReactNode }) {
  const { allowed } = useRequireArea("business");
  const t = useT();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const biz = useBusinessMe();

  if (!allowed) return null;

  const bizName = biz.data?.name || BIZ.name;
  const bizMeta = [biz.data?.category || BIZ.cat, biz.data?.area || BIZ.area]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-h-screen flex-col bg-cream font-sans text-ink lg:h-screen lg:flex-row">
      {/* sidebar — desktop */}
      <aside className="hidden w-[248px] flex-none flex-col bg-[#30251F] px-4 py-[22px] lg:flex">
        <div className="flex items-center gap-2.5 px-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand font-display text-[17px] font-extrabold text-brand-fg">
            J
          </div>
          <div className="font-display text-[17px] font-bold text-white">Jaqyn</div>
          <span className="ml-auto text-[11px] font-semibold text-[#9A8B7B]">{t("owner.business")}</span>
        </div>
        <div className="mt-[22px] min-h-0 flex-1 overflow-y-auto">
          <NavLinks pathname={pathname} />
        </div>
        <div className="mt-auto pt-5">
          <SidebarLanguageSwitch />
          <OwnerCard />
        </div>
      </aside>

      {/* top bar — mobile */}
      <div className="flex items-center gap-3 bg-ink px-4 py-3 lg:hidden">
        <button
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/10 text-lg text-white"
        >
          ☰
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-brand font-display text-[14px] font-extrabold text-brand-fg">
            J
          </div>
          <span className="font-display text-[15px] font-bold text-white">{title}</span>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-pill bg-sage-soft px-2.5 py-1 text-[11px] font-bold text-ok">
          <span className="h-1.5 w-1.5 rounded-full bg-sage-deep" />
          {t("owner.status.active")}
        </span>
      </div>

      {/* drawer — mobile */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-ink/50" />
          <aside
            className="absolute left-0 top-0 flex h-full w-[260px] flex-col bg-ink px-4 py-[22px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand font-display text-[17px] font-extrabold text-brand-fg">
                J
              </div>
              <div className="font-display text-[17px] font-bold text-white">Jaqyn</div>
              <button onClick={() => setDrawer(false)} className="ml-auto text-xl text-[#9A8B7B]" aria-label="Close menu">
                ×
              </button>
            </div>
            <div className="mt-[22px] min-h-0 flex-1 overflow-y-auto">
              <NavLinks pathname={pathname} onNavigate={() => setDrawer(false)} />
            </div>
            <div className="mt-auto pt-5">
              <SidebarLanguageSwitch />
              <OwnerCard />
            </div>
          </aside>
        </div>
      )}

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col lg:bg-[#FBF7F0]">
        <header className="hidden items-center justify-between border-b border-line bg-card px-6 py-5 lg:flex lg:px-[30px]">
          <div>
            <div className="font-display text-[22px] font-bold text-ink">{title}</div>
            <div className="mt-0.5 text-[13px] text-subtle">
              {bizName}
              {bizMeta ? ` · ${bizMeta}` : ""}
            </div>
          </div>
          <span className="inline-flex items-center gap-[7px] rounded-pill bg-sage-soft px-3.5 py-2 text-[12.5px] font-bold text-ok">
            <span className="h-[7px] w-[7px] rounded-full bg-sage-deep" />
            {t("owner.status.active")}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto bg-[#FBF7F0] px-4 py-5 sm:px-6 lg:px-[30px] lg:py-[26px]">{children}</div>
      </div>
    </div>
  );
}
