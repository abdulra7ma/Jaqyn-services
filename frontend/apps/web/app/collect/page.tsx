"use client";

import { useMe, useMyQr } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Card } from "@jaqyn/ui";
import { CustomerShell } from "../_components/CustomerShell";
import { QueryBoundary } from "../_components/QueryBoundary";
import { InitialTile, UserAvatar } from "../_components/kit";
import { useRequireAuth } from "../_lib/auth";

export default function CollectPage() {
  const t = useT();
  const { isAuthenticated } = useRequireAuth();
  const me = useMe(isAuthenticated);
  const qr = useMyQr(isAuthenticated);

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
            {me.data?.user ? (
              <UserAvatar user={me.data.user} size={44} />
            ) : (
              <InitialTile name="?" variant="gradient" size={44} />
            )}
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
        </div>
      )}
    </CustomerShell>
  );
}
