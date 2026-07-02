"use client";

// Settings › Brand: logo + cover uploads (persist immediately) and the
// glyph / accent / tags fields (persist on Save).

import { useRef } from "react";
import { useBusinessMe, useUpdateBusiness, useUploadBusinessCover, useUploadBusinessLogo } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { LABEL, SaveButton, SectionCard, useHydratedForm, type Notify } from "./parts";
import { TagInput } from "./TagInput";
import { IconPicker } from "./IconPicker";

const ACCENTS = ["#C25E3C", "#5E8B6A", "#E7A23E", "#6A6BC2", "#B0563A"];

export function BrandSection({ notify }: { notify: Notify }) {
  const t = useT();
  const me = useBusinessMe();
  const update = useUpdateBusiness();
  const uploadLogo = useUploadBusinessLogo();
  const uploadCover = useUploadBusinessCover();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const logoUrl = me.data?.logo_url ?? null;
  const coverUrl = me.data?.cover_url ?? null;

  const [form, setForm] = useHydratedForm(me.data, () => ({
    glyph: me.data?.glyph || "☕",
    accent_color: me.data?.accent_color || "#C25E3C",
    tags: me.data?.tags ?? [],
  }));

  function onLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadLogo.mutate(file);
    e.target.value = "";
  }
  function onCoverPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadCover.mutate(file);
    e.target.value = "";
  }

  function save() {
    update.mutate(
      { glyph: form.glyph, accent_color: form.accent_color, tags: form.tags },
      {
        onSuccess: () => notify(t("owner.profile.saved")),
        onError: () => notify(t("owner.profile.saveFailed")),
      },
    );
  }

  const uploadBtn =
    "rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[13px] font-bold text-ink transition hover:border-brand disabled:opacity-60";

  return (
    <SectionCard title={t("owner.profile.appearance")}>
      {/* Images: logo (square) + cover (wide). Each uploads immediately. */}
      <div className="mt-3.5 grid gap-4 sm:grid-cols-2">
        <div>
          <span className={LABEL}>{t("business.profile.logo")}</span>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-[16px] border border-line bg-brand-muted text-2xl">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={t("business.profile.logo")} className="h-full w-full object-cover" />
              ) : (
                form.glyph
              )}
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={onLogoPick} />
            <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadLogo.isPending} className={uploadBtn}>
              {uploadLogo.isPending ? t("common.loading") : t("business.profile.uploadLogo")}
            </button>
          </div>
        </div>
        <div>
          <span className={LABEL}>{t("business.profile.cover")}</span>
          <div className="mt-1.5 flex items-center gap-3">
            <div
              className="h-16 w-24 flex-none overflow-hidden rounded-[14px] border border-line bg-board/40"
              style={
                coverUrl
                  ? { background: `url('${encodeURI(coverUrl)}') center/cover` }
                  : { background: `linear-gradient(150deg, ${form.accent_color}, ${shade(form.accent_color)})` }
              }
            />
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={onCoverPick} />
            <button type="button" onClick={() => coverInputRef.current?.click()} disabled={uploadCover.isPending} className={uploadBtn}>
              {uploadCover.isPending ? t("common.loading") : t("business.profile.uploadCover")}
            </button>
          </div>
        </div>
      </div>

      {/* Brand color + fallback icon */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <span className={LABEL}>{t("owner.profile.accent")}</span>
          <div className="mt-2 flex gap-2.5">
            {ACCENTS.map((a) => {
              const sel = form.accent_color === a;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setForm({ ...form, accent_color: a })}
                  aria-label={a}
                  aria-pressed={sel}
                  className={`relative h-9 w-9 rounded-full transition ${sel ? "ring-2 ring-ink ring-offset-2 ring-offset-card" : "hover:scale-105"}`}
                  style={{ background: a }}
                >
                  {sel && <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-white">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className={LABEL}>{t("owner.profile.icon")}</span>
          <div className="mt-1.5 flex items-center gap-2.5">
            <IconPicker value={form.glyph} onChange={(glyph) => setForm({ ...form, glyph })} />
            <span className="text-[12px] leading-snug text-subtle">{t("owner.settings.iconHint")}</span>
          </div>
        </div>
      </div>

      {/* Tags — chip editor */}
      <div className="mt-4">
        <span className={LABEL}>{t("owner.settings.tags")}</span>
        <TagInput value={form.tags} onChange={(tags) => setForm({ ...form, tags })} placeholder={t("owner.settings.tagsPlaceholder")} />
        <p className="mt-1.5 text-[12px] text-subtle">{t("owner.settings.tagsHint")}</p>
      </div>

      <SaveButton onClick={save} pending={update.isPending} />
    </SectionCard>
  );
}

// darken a hex accent for the gradient stop
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 30);
  const g = Math.max(0, ((n >> 8) & 255) - 30);
  const b = Math.max(0, (n & 255) - 30);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
