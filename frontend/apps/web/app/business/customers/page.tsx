"use client";

// Customers (OwnerShell design, responsive), wired to /api/business/customers/.
// Privacy-masked customer list as a table on desktop, cards on mobile.

import { useBusinessCustomers, type MaskedCustomer } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { OwnerShell } from "../_components/OwnerShell";

const CARD = "rounded-[18px] border border-line bg-card p-5";

export default function BusinessCustomersPage() {
  const t = useT();
  const customers = useBusinessCustomers();
  const list = customers.data ?? [];

  return (
    <OwnerShell title={t("owner.nav.customers")}>
      <div className="mx-auto max-w-[900px] animate-[jqIn_.3s_ease]">
          <div className="mb-4 flex items-center gap-2.5">
            <div className={`${CARD} flex-1 !py-4`}>
              <div className="text-[12.5px] font-semibold text-subtle">{t("owner.customers.total")}</div>
              <div className="mt-1 font-display text-[26px] font-extrabold leading-none text-ink">
                {customers.isLoading ? "—" : list.length}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[18px] border border-line bg-card">
            <div className="hidden grid-cols-[1fr_1fr] gap-4 border-b border-line px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-subtle sm:grid">
              <span>{t("owner.customers.customer")}</span>
              <span>{t("biz.phone")}</span>
            </div>
            {customers.isLoading ? (
              <div className="px-5 py-10 text-center text-subtle">{t("owner.customers.loading")}</div>
            ) : list.length === 0 ? (
              <div className="px-5 py-12 text-center text-[13.5px] text-subtle">
                {t("owner.customers.empty")}
              </div>
            ) : (
              list.map((c: MaskedCustomer) => (
                <div key={c.id} className="flex items-center justify-between gap-4 border-b border-[#F4ECDF] px-5 py-3.5 sm:grid sm:grid-cols-[1fr_1fr]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#F4ECDF] font-display text-[13px] font-bold text-brand">
                      {(c.name || c.phone || "?").charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-ink">{c.name || t("owner.customers.guest")}</span>
                  </div>
                  <span className="text-[13.5px] text-subtle">{c.phone}</span>
                </div>
              ))
            )}
          </div>
        </div>
    </OwnerShell>
  );
}
