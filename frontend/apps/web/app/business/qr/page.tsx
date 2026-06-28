"use client";

// Merchant QR code (OwnerShell design, responsive), wired to /api/business/qr/.
// Customers scan it to collect rewards.

import { useMerchantQr } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { OwnerShell } from "../_components/OwnerShell";

const CARD = "rounded-[18px] border border-line bg-card p-5";

export default function BusinessQrPage() {
  const t = useT();
  const qr = useMerchantQr();

  return (
    <OwnerShell title={t("owner.nav.qr")}>
      <div className="mx-auto flex max-w-[760px] animate-[jqIn_.3s_ease] flex-col gap-5 lg:flex-row lg:items-start">
          <div className="rounded-[22px] border border-line bg-card p-[30px] text-center shadow-card lg:w-[340px]">
            {qr.isLoading ? (
              <div className="flex h-60 items-center justify-center text-subtle">{t("owner.qr.loading")}</div>
            ) : qr.isError || !qr.data ? (
              <div className="flex h-60 items-center justify-center text-center text-subtle">
                {t("owner.qr.unavailable")}
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.data.png} alt={t("owner.qr.alt")} className="mx-auto h-60 w-60" />
                <div className="mt-4 font-display text-base font-bold text-ink">{t("owner.qr.scan")}</div>
                <div className="mt-1 break-all text-xs text-subtle">{qr.data.url}</div>
                <a href={qr.data.png} download="jaqyn-qr.png" className="mt-5 block rounded-[14px] bg-brand py-3.5 text-sm font-bold text-brand-fg shadow-glow">
                  {t("owner.qr.download")}
                </a>
              </>
            )}
          </div>

          <div className="flex-1">
            <div className={CARD}>
              <div className="font-display text-[15px] font-bold text-ink">{t("owner.qr.counterTitle")}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-subtle">
                {t("owner.qr.counterHint")}
              </p>
              <ul className="mt-3.5 flex flex-col gap-2.5 text-[13.5px] text-ink">
                <li className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#F4ECDF] text-sm">🖨️</span>
                  {t("owner.qr.printable")}
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#F4ECDF] text-sm">📇</span>
                  {t("owner.qr.tableTent")}
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#F4ECDF] text-sm">🔗</span>
                  {t("owner.qr.copyLink")}
                </li>
              </ul>
            </div>
          </div>
        </div>
    </OwnerShell>
  );
}
