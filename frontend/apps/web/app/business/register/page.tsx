"use client";

import { useRegisterBusiness } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Card, Input } from "@jaqyn/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BusinessShell } from "../_components/BusinessShell";
import { ConsentNote } from "../../_components/ConsentNote";
import { useErrMessage } from "../../_lib/useErrMessage";
import { useRequireAuth } from "../../_lib/auth";

const CATEGORIES = ["cafe", "restaurant", "barber", "beauty", "retail", "bakery", "other"];

export default function BusinessRegisterPage() {
  const t = useT();
  const errMessage = useErrMessage();
  const router = useRouter();
  const { isAuthenticated } = useRequireAuth();
  const register = useRegisterBusiness();

  const [form, setForm] = useState({
    name: "",
    category: "cafe",
    address: "",
    area: "",
    phone: "",
    description: "",
    instagram_url: "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (!isAuthenticated) return null;

  return (
    <BusinessShell title={t("biz.register")} back="/business" showNav={false}>
      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate(form, { onSuccess: () => router.replace("/business") });
          }}
        >
          <Input label={t("biz.name")} value={form.name} onChange={set("name")} required />
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            {t("biz.category")}
            <select
              value={form.category}
              onChange={set("category")}
              className="min-h-11 rounded-xl border border-line bg-card px-3 text-base"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <Input label={t("biz.address")} value={form.address} onChange={set("address")} required />
          <Input label={t("biz.area")} value={form.area} onChange={set("area")} required />
          <Input label={t("biz.phone")} type="tel" value={form.phone} onChange={set("phone")} required />
          <Input label={t("biz.description")} value={form.description} onChange={set("description")} />
          <Input label={t("biz.instagram")} value={form.instagram_url} onChange={set("instagram_url")} />
          {register.isError && <p className="text-sm text-danger">{errMessage(register.error)}</p>}
          <Button type="submit" disabled={register.isPending}>
            {register.isPending ? t("common.loading") : t("biz.registerCta")}
          </Button>
          <ConsentNote className="text-center text-[12.5px] leading-relaxed text-subtle" />
        </form>
      </Card>
    </BusinessShell>
  );
}
