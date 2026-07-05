"use client";

import { useT } from "@jaqyn/i18n";
import { Button } from "@jaqyn/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BusinessShell } from "../_components/BusinessShell";
import { useAuth, useRequireArea } from "../../_lib/auth";

export default function BusinessMorePage() {
  const t = useT();
  const router = useRouter();
  const { allowed } = useRequireArea("business");
  const { logout } = useAuth();

  if (!allowed) return null;

  return (
    <BusinessShell title={t("biz.more.title")}>
      <div className="flex flex-col gap-4">
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
