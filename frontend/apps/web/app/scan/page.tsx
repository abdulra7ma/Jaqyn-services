"use client";

import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { CustomerShell } from "../_components/CustomerShell";
import { ScanIcon } from "../_components/icons";

/**
 * Customers no longer scan business QRs to collect.
 * Staff scan the customer's personal QR instead.
 * This page now directs customers to /collect (show-QR screen).
 *
 * The /q/[token] route is preserved for first-scan business card flows.
 */
export default function ScanPage() {
  const t = useT();

  return (
    <CustomerShell title={t("scan.title")} back="/" showNav={false}>
      <div className="flex flex-col items-center gap-6 pt-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-brand/15 text-brand">
          <ScanIcon className="h-9 w-9" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">{t("collect.title")}</h1>
          <p className="mt-2 max-w-[300px] text-sm text-subtle">{t("collect.subtitle")}</p>
        </div>
        <Link
          href="/collect"
          className="inline-flex min-h-11 w-full max-w-xs items-center justify-center rounded-pill bg-brand-gradient px-5 text-base font-semibold text-brand-fg shadow-glow transition hover:brightness-105 active:brightness-95"
        >
          {t("collect.title")}
        </Link>
      </div>
    </CustomerShell>
  );
}
