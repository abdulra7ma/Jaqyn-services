"use client";

// Business owner desktop shell, translated from the Jaqyn.dc.html design canvas
// (business owner area: dark sidebar nav + main panel). Responsive: the sidebar
// collapses to a top bar + slide-over drawer below `lg`.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../../_lib/auth";

type NavItem = { label: string; icon: string; href: string };
type NavGroup = { label: string | null; items: NavItem[] };

export const OWNER_NAV: NavGroup[] = [
  { label: null, items: [{ label: "Dashboard", icon: "▢", href: "/business/dashboard" }] },
  {
    label: "Loyalty",
    items: [
      { label: "Loyalty program", icon: "◎", href: "/business/rewards" },
      { label: "QR Code", icon: "▦", href: "/business/qr" },
    ],
  },
  {
    label: "Grow",
    items: [
      { label: "Campaigns", icon: "◇", href: "/business/campaigns" },
      { label: "Group Deals", icon: "⛌", href: "/business/offers" },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Customers", icon: "◐", href: "/business/customers" },
      { label: "Reports", icon: "◔", href: "/business/reports" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile", icon: "◑", href: "/business/profile" },
      { label: "Staff Mode", icon: "⊕", href: "/staff" },
    ],
  },
];

const BIZ = { name: "Manas Coffee", cat: "Cafe", area: "Chuy Avenue", owner: "Nurlan A." };

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-[13px]">
      {OWNER_NAV.map((g, gi) => (
        <div key={gi}>
          {g.label && (
            <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.09em] text-[#7E7060]">{g.label}</div>
          )}
          <div className="flex flex-col gap-0.5">
            {g.items.map((n) => {
              const active = pathname === n.href || pathname.startsWith(n.href + "/");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-[13.5px] font-semibold transition ${
                    active ? "bg-brand text-brand-fg" : "text-[#C9BCA8] hover:bg-white/5"
                  }`}
                >
                  <span className="w-[18px] text-center text-[15px]">{n.icon}</span>
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function OwnerCard() {
  const router = useRouter();
  const { logout } = useAuth();
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
          <Link
            href="/staff"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13px] font-semibold text-board hover:bg-white/5"
          >
            <span className="w-[18px] text-center text-[15px]">⊕</span>
            Switch to Staff Mode
          </Link>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold text-[#E8A48C] hover:bg-white/5"
          >
            <span className="w-[18px] text-center text-[15px]">⏻</span>
            Log out
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full items-center gap-[11px] rounded-[14px] p-3.5 transition ${open ? "bg-white/10" : "bg-white/5 hover:bg-white/[0.08]"}`}
      >
        <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-brand font-display text-[15px] font-bold text-brand-fg">
          {BIZ.owner.charAt(0)}
        </div>
        <div className="min-w-0 text-left">
          <div className="truncate text-[13.5px] font-semibold text-white">{BIZ.owner}</div>
          <div className="text-[11.5px] text-[#9A8B7B]">Owner</div>
        </div>
        <span className={`ml-auto flex-none text-[#9A8B7B] transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
    </div>
  );
}

export function OwnerShell({ title, children }: { title: string; children: ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-cream font-sans text-ink lg:h-screen lg:flex-row">
      {/* sidebar — desktop */}
      <aside className="hidden w-[236px] flex-none flex-col bg-ink px-4 py-[22px] lg:flex">
        <div className="flex items-center gap-2.5 px-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand font-display text-[17px] font-extrabold text-brand-fg">
            J
          </div>
          <div className="font-display text-[17px] font-bold text-white">Jaqyn</div>
          <span className="ml-auto text-[11px] font-semibold text-[#9A8B7B]">Business</span>
        </div>
        <div className="mt-[22px]">
          <NavLinks pathname={pathname} />
        </div>
        <OwnerCard />
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
          Active
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
            <div className="mt-[22px] overflow-y-auto">
              <NavLinks pathname={pathname} onNavigate={() => setDrawer(false)} />
            </div>
            <OwnerCard />
          </aside>
        </div>
      )}

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col lg:bg-[#FBF7F0]">
        <header className="hidden items-center justify-between border-b border-line bg-card px-6 py-5 lg:flex lg:px-[30px]">
          <div>
            <div className="font-display text-[22px] font-bold text-ink">{title}</div>
            <div className="mt-0.5 text-[13px] text-subtle">
              {BIZ.name} · {BIZ.cat} · {BIZ.area}
            </div>
          </div>
          <span className="inline-flex items-center gap-[7px] rounded-pill bg-sage-soft px-3.5 py-2 text-[12.5px] font-bold text-ok">
            <span className="h-[7px] w-[7px] rounded-full bg-sage-deep" />
            Active
          </span>
        </header>

        <div className="flex-1 overflow-y-auto bg-[#FBF7F0] px-4 py-5 sm:px-6 lg:px-[30px] lg:py-[26px]">{children}</div>
      </div>
    </div>
  );
}
