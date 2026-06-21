"use client";

// Merchant QR code (OwnerShell design, responsive), wired to /api/business/qr/.
// Customers scan it to collect rewards.

import { useMerchantQr } from "@jaqyn/api";
import { OwnerShell } from "../_components/OwnerShell";
import { useAuth } from "../../_lib/auth";

const CARD = "rounded-[18px] border border-line bg-card p-5";

export default function BusinessQrPage() {
  const { isAuthenticated, ready } = useAuth();
  const qr = useMerchantQr(ready && isAuthenticated);

  return (
    <OwnerShell title="QR Code">
      {!ready ? null : !isAuthenticated ? (
        <div className={`${CARD} max-w-md`}>
          <p className="text-sm text-subtle">Sign in to view your counter QR code.</p>
        </div>
      ) : (
        <div className="mx-auto flex max-w-[760px] animate-[jqIn_.3s_ease] flex-col gap-5 lg:flex-row lg:items-start">
          <div className="rounded-[22px] border border-line bg-card p-[30px] text-center shadow-card lg:w-[340px]">
            {qr.isLoading ? (
              <div className="flex h-60 items-center justify-center text-subtle">Loading QR…</div>
            ) : qr.isError || !qr.data ? (
              <div className="flex h-60 items-center justify-center text-center text-subtle">
                QR code unavailable. Finish onboarding and verification first.
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.data.png} alt="merchant QR" className="mx-auto h-60 w-60" />
                <div className="mt-4 font-display text-base font-bold text-ink">Scan to collect rewards</div>
                <div className="mt-1 break-all text-xs text-subtle">{qr.data.url}</div>
                <a href={qr.data.png} download="jaqyn-qr.png" className="mt-5 block rounded-[14px] bg-brand py-3.5 text-sm font-bold text-brand-fg shadow-glow">
                  Download QR as image
                </a>
              </>
            )}
          </div>

          <div className="flex-1">
            <div className={CARD}>
              <div className="font-display text-[15px] font-bold text-ink">Your counter QR code</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-subtle">
                Print it for your counter or show it on a tablet. Customers scan to join your loyalty program and collect stamps.
              </p>
              <ul className="mt-3.5 flex flex-col gap-2.5 text-[13.5px] text-ink">
                <li className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#F4ECDF] text-sm">🖨️</span>
                  Printable counter card
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#F4ECDF] text-sm">📇</span>
                  Table tent (folded)
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#F4ECDF] text-sm">🔗</span>
                  Copy share link
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </OwnerShell>
  );
}
