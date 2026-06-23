"use client";

import { useCampaigns, useMe, useMyQr, type Campaign } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useEffect } from "react";
import { CustomerShell } from "../../_components/CustomerShell";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { GlyphTile } from "../../_components/campaigns";
import { useRequireAuth } from "../../_lib/auth";

/** +996700000001 → +996 700 *** 01 */
function maskPhone(phone?: string): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length < 6) return phone;
  return `+${d.slice(0, 3)} ${d.slice(3, 6)} *** ${d.slice(-2)}`;
}

/** Campaigns the customer can earn a visit toward right now (joined, unfinished, active). */
function eligibleNow(campaigns: Campaign[]): Campaign[] {
  return campaigns.filter(
    (c) =>
      c.status === "active" &&
      c.campaign_type !== "group" &&
      !!c.my_progress?.joined &&
      !c.my_progress?.completed,
  );
}

export default function VisitQrPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  const me = useMe(isAuthenticated);
  const qr = useMyQr(isAuthenticated);
  // Poll so a staff-side visit moves a campaign off the "eligible right now" list live.
  const campaigns = useCampaigns(undefined, { refetchInterval: 4000 });

  // Keep the screen awake while the QR is shown so staff can scan it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | undefined;
    (async () => {
      try {
        lock = await (
          navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }
        ).wakeLock?.request("screen");
      } catch {
        /* wake lock unsupported / denied — the QR still shows */
      }
    })();
    return () => {
      void lock?.release().catch(() => {});
    };
  }, []);

  const name = me.data?.user.name || me.data?.user.phone || "?";

  return (
    <CustomerShell title={t("cmp.visitQr.title")} back="/campaigns" showNav={false} hideChromeTitle>
      {!isAuthenticated ? null : (
        <QueryBoundary query={qr}>
          {(data) => {
            const eligible = eligibleNow(campaigns.data ?? []);
            return (
              <div className="flex flex-col items-center">
                {/* screen-brightened pill */}
                <div className="flex w-full justify-end">
                  <span className="inline-flex items-center gap-1.5 rounded-pill bg-amber/12 px-3 py-1.5 text-xs font-bold text-amber-deep">
                    <span aria-hidden>☀</span>
                    {t("qr.screenBrightened")}
                  </span>
                </div>

                <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-ink">
                  {t("cmp.visitQr.title")}
                </h1>
                <p className="mt-1 max-w-[250px] text-center text-sm text-subtle">
                  {t("cmp.visitQr.subtitle")}
                </p>

                {/* QR (personal CUSTOMER_PROFILE token) */}
                <div className="mt-4 rounded-[28px] border border-[#EDEDED] bg-card p-5 shadow-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={data.png} alt={t("cmp.visitQr.title")} className="h-[228px] w-[228px]" />
                </div>
                <p className="mt-3 text-center text-[12.5px] text-subtle">
                  {name} · {maskPhone(me.data?.user.phone)} · {t("cmp.visitQr.refresh")}
                </p>

                {/* eligible right now */}
                <div className="mt-6 w-full rounded-[18px] border border-line bg-cream p-4">
                  <p className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-subtle">
                    {t("cmp.visitQr.eligible")}
                  </p>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {eligible.length === 0 ? (
                      <p className="py-1 text-center text-[13px] text-subtle">
                        {t("cmp.visitQr.none")}
                      </p>
                    ) : (
                      eligible.map((c) => {
                        const target = c.my_progress?.target_count ?? c.rule.required_count ?? 0;
                        return (
                          <div key={c.id} className="flex items-center gap-3">
                            <GlyphTile glyph={c.glyph} size={38} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-ink">{c.name}</p>
                              <p className="truncate text-xs text-subtle">{c.business.name}</p>
                            </div>
                            <span className="whitespace-nowrap text-[13px] font-bold text-brand">
                              {c.my_progress?.current_count ?? 0}/{target}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          }}
        </QueryBoundary>
      )}
    </CustomerShell>
  );
}
