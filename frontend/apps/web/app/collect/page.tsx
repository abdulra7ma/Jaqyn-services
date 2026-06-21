"use client";

import { useMe, useMyQr, useRewards } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Card } from "@jaqyn/ui";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { InitialTile, StampRow } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";

export default function CollectPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  const me = useMe(isAuthenticated);
  const qr = useMyQr(isAuthenticated);
  const rewards = useRewards({ refetchInterval: 3000 });

  return (
    <CustomerShell title={t("collect.title")} hideChromeTitle back="/">
      {!isAuthenticated ? null : (
        <div className="flex flex-col items-center gap-5 pt-2">
          {/* hero title */}
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold text-ink">{t("collect.title")}</h1>
            <p className="mt-1 text-sm text-subtle">{t("collect.subtitle")}</p>
          </div>

          {/* member line */}
          <div className="flex items-center gap-3">
            <InitialTile
              name={me.data?.user.name || me.data?.user.phone || "?"}
              variant="gradient"
              size={44}
            />
            <div>
              <p className="font-semibold text-ink">{me.data?.user.name || ""}</p>
              <p className="text-xs text-subtle">{me.data?.user.phone}</p>
            </div>
          </div>

          {/* personal QR */}
          <QueryBoundary query={qr}>
            {(data) => (
              <Card className="rounded-[24px] p-6 shadow-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.png} alt="my QR" className="h-56 w-56" />
              </Card>
            )}
          </QueryBoundary>

          {/* live progress strip */}
          <QueryBoundary query={rewards} isEmpty={(r) => r.filter((p) => p.status === "active").length === 0}>
            {(list) => (
              <div className="w-full max-w-sm space-y-3">
                {list
                  .filter((p) => p.status === "active")
                  .map((p) => {
                    const target = p.target_count ?? p.reward_program.required_count ?? 0;
                    return (
                      <div
                        key={p.id}
                        className="rounded-2xl border border-line bg-card px-4 py-3 shadow-card"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-semibold text-ink">
                            {p.business.name || p.reward_program.title}
                          </p>
                          {target > 0 && (
                            <span className="text-xs text-subtle">
                              {t("collect.progress")
                                .replace("{count}", String(p.current_count))
                                .replace("{total}", String(target))}
                            </span>
                          )}
                        </div>
                        {target > 0 && <StampRow current={p.current_count} target={target} />}
                      </div>
                    );
                  })}
              </div>
            )}
          </QueryBoundary>
        </div>
      )}
    </CustomerShell>
  );
}
