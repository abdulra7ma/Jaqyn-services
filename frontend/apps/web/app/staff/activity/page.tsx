"use client";

import { useRecentActivity } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Badge, Button, Card } from "@jaqyn/ui";
import Link from "next/link";
import { StaffShell } from "../_components/StaffShell";
import { QueryBoundary } from "../../_components/QueryBoundary";
import { useStaffAuth } from "../_lib/staffAuth";

function fmtTime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Campaign scan-log action codes → i18n keys (FE-4). The backend logs every
// campaign confirm/redeem through apps.qr.ScanLog (plan §1.1); map the known
// codes to friendly copy and fall back to the raw action for loyalty scans.
const CAMPAIGN_ACTION_LABELS: Record<string, string> = {
  campaign_visit: "staff.activity.campaignVisit",
  campaign_complete: "staff.activity.campaignComplete",
  campaign_redeem: "staff.activity.campaignRedeem",
  campaign_group: "staff.activity.campaignGroup",
};

type Row = { id: string; who: string; what: string; time: string; tone: "ok" | "danger" | "warn" | "neutral" };

export default function StaffActivityPage() {
  const t = useT();
  const { isStaff, ready } = useStaffAuth();
  const activity = useRecentActivity(isStaff);

  return (
    <StaffShell title={t("staff.title")}>
      {!ready ? null : !isStaff ? (
        <Card>
          <p className="text-sm text-subtle">{t("staff.login")}</p>
          <Link href="/staff/login" className="mt-3 block">
            <Button className="w-full">{t("staff.signIn")}</Button>
          </Link>
        </Card>
      ) : (
        <div className="flex animate-[jqIn_.3s_ease] flex-col gap-5">
          <QueryBoundary query={activity}>
            {(data) => {
              const rows: Row[] = [
                ...data.redemptions.map((r) => ({
                  id: `r-${r.id}`,
                  who: r.code,
                  what: `${t("staff.activity.redemptions")} · ${r.code}`,
                  time: fmtTime(r.created_at),
                  tone: (r.status === "redeemed" ? "ok" : "neutral") as Row["tone"],
                })),
                ...data.scans.map((s) => {
                  const campaignKey = CAMPAIGN_ACTION_LABELS[s.action];
                  return {
                    id: `s-${s.id}`,
                    who: s.action,
                    what: campaignKey ? t(campaignKey) : s.action,
                    time: fmtTime(s.created_at),
                    tone: (s.status === "success" ? "ok" : s.status === "blocked" ? "danger" : "warn") as Row["tone"],
                  };
                }),
              ];

              if (rows.length === 0) {
                return (
                  <div className="py-10 text-center text-subtle">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-line text-[26px]">≡</div>
                    <div className="mt-4 font-display text-[17px] font-bold text-ink">{t("staff.activity.emptyTitle")}</div>
                  </div>
                );
              }

              return (
                <div>
                  <p className="mb-3 text-[13.5px] font-semibold text-subtle">{t("staff.activity.title")}</p>
                  <div className="flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
                    {rows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between bg-card px-4 py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-brand-muted font-display text-[13px] font-bold text-brand">
                            {row.who.trim().charAt(0).toUpperCase() || "•"}
                          </span>
                          <span className="truncate text-sm font-semibold text-ink">{row.what}</span>
                        </div>
                        <div className="flex flex-none items-center gap-2">
                          <Badge tone={row.tone}>{row.tone === "ok" ? "✓" : row.tone}</Badge>
                          <span className="text-xs text-subtle">{row.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
          </QueryBoundary>
        </div>
      )}
    </StaffShell>
  );
}
