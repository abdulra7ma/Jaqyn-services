"use client";

import { useBusinessMe, useRegenerateApprovalCode, useUpdateBusiness } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Card, Input } from "@jaqyn/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BusinessShell } from "../_components/BusinessShell";
import { useErrMessage } from "../../_lib/useErrMessage";
import { useAuth, useRequireArea } from "../../_lib/auth";

export default function BusinessMorePage() {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();
  const { allowed } = useRequireArea("business");
  const { logout } = useAuth();
  const me = useBusinessMe();
  const update = useUpdateBusiness();
  const regen = useRegenerateApprovalCode();

  const [form, setForm] = useState({ name: "", address: "", area: "", phone: "", description: "" });
  useEffect(() => {
    if (me.data) {
      setForm({
        name: me.data.name,
        address: me.data.address,
        area: me.data.area,
        phone: me.data.phone,
        description: me.data.description ?? "",
      });
    }
  }, [me.data]);

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

        <Card>
          <p className="mb-2 text-sm font-medium text-ink">{t("biz.settings")}</p>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate(form);
            }}
          >
            <Input label={t("biz.name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label={t("biz.address")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <Input label={t("biz.area")} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
            <Input label={t("biz.phone")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {update.isError && <p className="text-sm text-danger">{errMessage(update.error)}</p>}
            {update.isSuccess && <p className="text-sm text-ok">{t("profile.saved")}</p>}
            <Button type="submit" disabled={update.isPending}>{t("common.save")}</Button>
          </form>
        </Card>

        <Link href="/business/customers"><Button variant="secondary" className="w-full">{t("biz.customers.title")}</Button></Link>
        <Link href="/business/reports"><Button variant="secondary" className="w-full">{t("biz.reports.title")}</Button></Link>
        <Button variant="ghost" onClick={() => { logout(); router.replace("/business"); }}>
          {t("auth.logout")}
        </Button>
      </div>
    </BusinessShell>
  );
}
