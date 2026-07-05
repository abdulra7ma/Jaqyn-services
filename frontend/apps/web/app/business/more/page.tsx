"use client";

import { useRegenerateApprovalCode, useStaffCode } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { AlertDialog, Button, Card } from "@jaqyn/ui";
import Link from "next/link";
import { useState } from "react";
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
  const staffCode = useStaffCode(allowed);
  const regen = useRegenerateApprovalCode();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!allowed) return null;

  // The displayed code: prefer the live query value; once regen succeeds the
  // mutation result is written into the same cache key via onSuccess, so
  // staffCode.data reflects the new code automatically.
  const displayedCode = staffCode.data?.code;

  return (
    <BusinessShell title={t("biz.more.title")}>
      <div className="flex flex-col gap-4">
        <Card>
          <p className="mb-2 text-sm font-medium text-ink">{t("biz.staffCode.title")}</p>
          {staffCode.isLoading && (
            <p className="mb-2 text-2xl font-bold tracking-widest text-subtle">——————</p>
          )}
          {displayedCode && (
            <p className="mb-2 text-2xl font-bold tracking-widest text-brand">{displayedCode}</p>
          )}
          {staffCode.isError && (
            <p className="mb-2 text-sm text-danger">{errMessage(staffCode.error)}</p>
          )}
          {regen.isError && (
            <p className="mb-2 text-sm text-danger">{errMessage(regen.error)}</p>
          )}
          <Button
            variant="secondary"
            disabled={regen.isPending}
            onClick={() => setConfirmOpen(true)}
          >
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

      <AlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("biz.staffCode.regenConfirm.title")}
        description={t("biz.staffCode.regenConfirm.description")}
        confirmLabel={t("biz.staffCode.regenConfirm.confirm")}
        cancelLabel={t("common.cancel")}
        destructive
        pending={regen.isPending}
        onConfirm={() => {
          regen.mutate(undefined, { onSuccess: () => setConfirmOpen(false) });
        }}
      />
    </BusinessShell>
  );
}
