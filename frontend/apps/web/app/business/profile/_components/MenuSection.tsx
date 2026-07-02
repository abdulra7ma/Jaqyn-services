"use client";

// Settings › Menu: catalog items shown on the customer profile. Add (with an
// optional image) / remove / re-image — each persists through its own mutation
// (no section Save).

import { useEffect, useRef, useState } from "react";
import {
  useAddCatalogItem,
  useCatalog,
  useRemoveCatalogItem,
  useUploadCatalogItemImage,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { FIELD, LABEL, SectionCard, type Notify } from "./parts";

const MENU_GROUPS = ["Coffee", "Kitchen", "Desserts", "Menu"];

export function MenuSection({ notify }: { notify: Notify }) {
  const t = useT();
  const catalog = useCatalog();
  const addItem = useAddCatalogItem();
  const removeItem = useRemoveCatalogItem();
  const uploadCatalogImage = useUploadCatalogItemImage();
  // Per-item file input refs keyed by catalog item id (re-image from the list).
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const addFileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<{ name: string; group: string; price: string; file: File | null }>({
    name: "",
    group: "Coffee",
    price: "",
    file: null,
  });
  // Object URL for the staged (pre-add) image preview; revoked when replaced/cleared.
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const items = catalog.data ?? [];

  function stageAddImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setDraft((d) => ({ ...d, file }));
  }

  function resetDraft(group: string) {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setDraft({ name: "", group, price: "", file: null });
  }

  function addMenu() {
    if (!draft.name.trim()) return;
    const file = draft.file;
    const group = draft.group;
    addItem.mutate(
      { name: draft.name.trim(), category: group, price: draft.price.trim(), module: "menu" },
      {
        onSuccess: (created) => {
          // Upload the staged image now that the item has an id.
          if (file) {
            uploadCatalogImage.mutate(
              { id: created.id, file },
              { onError: () => notify(t("owner.profile.imageUploadFailed")) },
            );
          }
          resetDraft(group);
        },
      },
    );
  }

  function onImagePick(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    uploadCatalogImage.mutate({ id, file }, { onError: () => notify(t("owner.profile.imageUploadFailed")) });
  }

  return (
    <SectionCard
      title={t("owner.profile.menu")}
      action={<span className="text-xs text-subtle">{t("owner.profile.menuHint")}</span>}
    >
      <div className="mt-3.5 flex flex-wrap items-end gap-2.5">
        {/* Optional image, attached to the item on Add. */}
        <div className="flex-none">
          <span className={LABEL}>{t("owner.settings.image")}</span>
          <button
            type="button"
            onClick={() => addFileRef.current?.click()}
            aria-label={t("owner.profile.uploadItemImage")}
            className="mt-1.5 flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-line bg-card transition hover:border-brand"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[20px] text-subtle">+</span>
            )}
          </button>
          <input ref={addFileRef} type="file" accept="image/*" className="hidden" onChange={stageAddImage} />
        </div>
        <label className="min-w-[130px] flex-[2]">
          <span className={LABEL}>{t("owner.profile.item")}</span>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Cappuccino" className={`${FIELD} mt-1.5`} />
        </label>
        <label className="min-w-[120px] flex-1">
          <span className={LABEL}>{t("owner.profile.section")}</span>
          <select value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })} className={`${FIELD} mt-1.5`}>
            {MENU_GROUPS.map((g) => (
              <option key={g} value={g}>
                {t(`owner.profile.menuGroup.${g.toLowerCase()}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="w-[92px] flex-none">
          <span className={LABEL}>{t("owner.profile.price")}</span>
          <input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="150 c" className={`${FIELD} mt-1.5`} />
        </label>
        <button onClick={addMenu} disabled={addItem.isPending} className="flex-none rounded-xl bg-brand px-[18px] py-3 text-sm font-bold text-brand-fg disabled:opacity-60">
          {t("owner.profile.add")}
        </button>
      </div>
      <div className="mt-3.5 flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="p-[18px] text-center text-[13px] text-subtle">{t("owner.profile.menuEmpty")}</div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 rounded-xl border border-line bg-[#FBF7F0] px-3.5 py-3">
              <div className="flex-none">
                <div
                  className="flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-[10px] border border-line bg-card"
                  onClick={() => inputRefs.current[it.id]?.click()}
                  title={t("owner.profile.uploadItemImage")}
                >
                  {it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[18px] text-subtle">+</span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={(el) => {
                    inputRefs.current[it.id] = el;
                  }}
                  onChange={(e) => onImagePick(it.id, e)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink">{it.name}</div>
                <div className="text-[11.5px] text-subtle">{it.category}</div>
              </div>
              <span className="text-[13.5px] font-semibold text-ink">{it.price}</span>
              <button onClick={() => removeItem.mutate(it.id)} className="h-7 w-7 flex-none rounded-lg border border-line bg-card text-[15px] text-[#B0563A]">
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}
