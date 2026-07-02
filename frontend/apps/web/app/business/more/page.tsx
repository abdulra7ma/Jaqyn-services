"use client";

import { useRegenerateApprovalCode } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Card } from "@jaqyn/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BusinessShell } from "../_components/BusinessShell";
import { useErrMessage } from "../../_lib/useErrMessage";
import { useAuth, useRequireArea } from "../../_lib/auth";

export default function BusinessMorePage() {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();
  const { allowed } = useRequireArea("business");
  const { logout } = useAuth();
  const regen = useRegenerateApprovalCode();

  if (!allowed) return null;

  return (
    <BusinessShell title={t("biz.more.title")}>
      <div className="flex flex-col gap-4">
        <Card>
          <p className="mb-2 text-sm font-medium text-ink">{t("biz.staffCode.title")}</p>
          {regen.isSuccess && (
            <p className="mb-2 text-2xl font-bold tracking-widest text-brand">{regen.data.code}</p>
          )}
          {regen.isError && <p className="mb-2 text-sm text-danger">{errMessage(regen.error)}</p>}
          <Button variant="secondary" disabled={regen.isPending} onClick={() => regen.mutate()}>
            {t("biz.staffCode.regenerate")}
          </Button>
        </Card>

        {/* Business fields now live in the full sectioned settings screen. */}
        <Link href="/business/profile"><Button variant="secondary" className="w-full">{t("biz.settings")}</Button></Link>
        <Link href="/business/customers"><Button variant="secondary" className="w-full">{t("biz.customers.title")}</Button></Link>
        <Link href="/business/reports"><Button variant="secondary" className="w-full">{t("biz.reports.title")}</Button></Link>
        <Button variant="ghost" onClick={() => { logout(); router.replace("/business"); }}>
          {t("auth.logout")}
        </Button>
      </div>
    </BusinessShell>
  );
}
