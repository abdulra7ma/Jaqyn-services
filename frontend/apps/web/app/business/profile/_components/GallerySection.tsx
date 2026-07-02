"use client";

// Settings › Gallery: list / upload (multi) / delete customer-profile photos.
// Each action persists through its own mutation. Cap: 8 photos.

import { useRef } from "react";
import { useDeleteGalleryImage, useGallery, useUploadGalleryImage } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { SectionCard, type Notify } from "./parts";

// Gallery is capped at 8 images. Source: spec images-gallery-location-plan.md §Contracts.
const GALLERY_LIMIT = 8;

export function GallerySection({ notify }: { notify: Notify }) {
  const t = useT();
  const gallery = useGallery();
  const uploadGallery = useUploadGalleryImage();
  const deleteGallery = useDeleteGalleryImage();
  const inputRef = useRef<HTMLInputElement>(null);

  const images = gallery.data ?? [];
  const full = images.length >= GALLERY_LIMIT;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const toUpload = files.slice(0, GALLERY_LIMIT - images.length);
    toUpload.forEach((file) => {
      uploadGallery.mutate(file, {
        onError: (err: unknown) => {
          const code = (err as { code?: string })?.code;
          notify(code === "GALLERY_LIMIT_REACHED" ? t("owner.profile.galleryFull") : t("owner.profile.galleryUploadFailed"));
        },
      });
    });
  }

  return (
    <SectionCard
      title={t("owner.profile.gallery")}
      hint={t("owner.profile.galleryHint")}
      action={
        <span className="rounded-pill bg-brand-muted px-2.5 py-1 text-[12.5px] font-bold text-brand">
          {images.length}/{GALLERY_LIMIT}
        </span>
      }
    >
      {images.length > 0 && (
        <div className="mt-3.5 grid grid-cols-4 gap-2">
          {images.map((img) => (
            <div key={img.id} className="group relative aspect-square overflow-hidden rounded-[10px] border border-line bg-[#F4ECDF]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.image_url} alt={img.caption || t("owner.profile.galleryPhoto")} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => deleteGallery.mutate(img.id)}
                disabled={deleteGallery.isPending}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-[11px] text-cream opacity-0 transition group-hover:opacity-100 disabled:opacity-40"
                aria-label={t("owner.profile.deletePhoto")}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {images.length === 0 && (
        <div className="mt-3.5 rounded-xl border border-dashed border-line bg-[#FBF7F0] p-[18px] text-center text-[13px] text-subtle">
          {t("owner.profile.galleryEmpty")}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={full || uploadGallery.isPending}
        className="mt-3.5 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[13px] font-bold text-ink disabled:opacity-60"
      >
        {uploadGallery.isPending
          ? t("owner.profile.uploading")
          : full
            ? t("owner.profile.galleryFullShort")
            : t("owner.profile.addPhotos")}
      </button>
    </SectionCard>
  );
}
