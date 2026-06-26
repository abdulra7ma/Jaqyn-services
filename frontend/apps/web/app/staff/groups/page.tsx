"use client";

import { useT } from "@jaqyn/i18n";
import { Button, Card } from "@jaqyn/ui";
import Link from "next/link";
import { StaffShell } from "../_components/StaffShell";
import { useStaffAuth } from "../_lib/staffAuth";

export default function StaffGroupsPage() {
  const t = useT();
  const { isStaff, ready } = useStaffAuth();

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
        <div className="py-10 text-center text-subtle">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-line text-[28px]">
            👥
          </div>
          <h2 className="mt-4 font-display text-[17px] font-bold text-ink">
            {t("staff.groups.emptyTitle")}
          </h2>
          <p className="mt-1.5 text-[13.5px]">{t("staff.groups.emptyHint")}</p>
          <Link href="/staff/scan" className="mt-5 inline-block">
            <Button>{t("staff.nav.scan")}</Button>
          </Link>
        </div>
      )}
    </StaffShell>
  );
}
