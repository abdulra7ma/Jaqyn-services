"use client";

// Settings › Profile: the public identity — name, category, price level, description.

import { useBusinessMe, useUpdateBusiness } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { FIELD, LABEL, SaveButton, SectionCard, useHydratedForm, type Notify } from "./parts";

const CATEGORIES = ["cafe", "restaurant", "bakery", "barber", "beauty", "retail", "other"];
const PRICE_LEVELS = ["c", "cc", "ccc"];

export function ProfileSection({ notify }: { notify: Notify }) {
  const t = useT();
  const me = useBusinessMe();
  const update = useUpdateBusiness();

  const [form, setForm] = useHydratedForm(me.data, () => ({
    name: me.data?.name ?? "",
    category: me.data?.category || "cafe",
    price_level: me.data?.price_level || "cc",
    description: me.data?.description ?? "",
  }));

  function save() {
    update.mutate(form, {
      onSuccess: () => notify(t("owner.profile.saved")),
      onError: () => notify(t("owner.profile.saveFailed")),
    });
  }

  return (
    <SectionCard title={t("owner.profile.publicProfile")} hint={t("owner.profile.publicHint")}>
      <label className="mt-3.5 block">
        <span className={LABEL}>{t("owner.profile.businessName")}</span>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${FIELD} mt-1.5`} />
      </label>
      <div className="mt-3.5 flex gap-3">
        <label className="flex-1">
          <span className={LABEL}>{t("owner.profile.category")}</span>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`${FIELD} mt-1.5`}>
            {CATEGORIES.map((v) => (
              <option key={v} value={v}>
                {t(`owner.profile.category.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1">
          <span className={LABEL}>{t("owner.profile.priceLevel")}</span>
          <div className="mt-1.5 flex gap-1.5">
            {PRICE_LEVELS.map((p) => {
              const sel = form.price_level === p;
              return (
                <button
                  key={p}
                  onClick={() => setForm({ ...form, price_level: p })}
                  className={`flex-1 rounded-xl border-[1.5px] py-3 text-sm font-bold ${sel ? "border-brand bg-brand text-brand-fg" : "border-line bg-card text-subtle"}`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <label className="mt-3.5 block">
        <span className={LABEL}>{t("biz.description")}</span>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className={`${FIELD} mt-1.5 resize-none leading-relaxed`}
        />
      </label>
      <SaveButton onClick={save} pending={update.isPending} />
    </SectionCard>
  );
}
