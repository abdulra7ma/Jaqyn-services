"use client";

// Settings › Contact & location: contact channels, address, hours, and the
// map-based lat/lng picker.

import { useState } from "react";
import { useBusinessMe, useUpdateBusiness } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Dialog } from "@jaqyn/ui";
import { LocationPicker } from "../../../_components/LocationPicker";
import { FIELD, LABEL, SaveButton, SectionCard, useHydratedForm, type Notify } from "./parts";
import { WeekHoursEditor, formatWeek, initialWeek, weekToPayload } from "../../_components/WeekHoursEditor";

// Clamp a coordinate to the model's 6 decimal places (DecimalField
// max_digits=9, decimal_places=6) — the map picker emits higher precision, which
// the backend rejects. Empty → null.
function coord(value: string): string | null {
  const s = value.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n.toFixed(6) : null;
}

export function ContactSection({ notify }: { notify: Notify }) {
  const t = useT();
  const me = useBusinessMe();
  const update = useUpdateBusiness();
  const [hoursOpen, setHoursOpen] = useState(false);

  const [form, setForm] = useHydratedForm(me.data, () => ({
    phone: me.data?.phone ?? "",
    public_email: me.data?.public_email ?? "",
    website_url: me.data?.website_url ?? "",
    instagram_url: me.data?.instagram_url ?? "",
    address: me.data?.address ?? "",
    area: me.data?.area || me.data?.address || "",
    city: me.data?.city ?? "",
    week: initialWeek(me.data?.working_hours),
    lat: me.data?.latitude ?? "",
    lng: me.data?.longitude ?? "",
  }));

  function save() {
    update.mutate(
      {
        phone: form.phone,
        public_email: form.public_email,
        website_url: form.website_url,
        instagram_url: form.instagram_url,
        address: form.address,
        area: form.area,
        city: form.city,
        latitude: coord(form.lat),
        longitude: coord(form.lng),
        working_hours: weekToPayload(form.week),
      },
      {
        onSuccess: () => notify(t("owner.profile.saved")),
        onError: () => notify(t("owner.profile.saveFailed")),
      },
    );
  }

  const hoursSummary = formatWeek(form.week, (d) => t(`owner.settings.day.${d}`));

  return (
    <SectionCard title={t("owner.profile.contactLocation")}>
      <div className="mt-3.5 flex gap-3">
        <label className="flex-1">
          <span className={LABEL}>{t("biz.phone")}</span>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${FIELD} mt-1.5`} />
        </label>
        <label className="flex-1">
          <span className={LABEL}>{t("owner.profile.publicEmail")}</span>
          <input value={form.public_email} onChange={(e) => setForm({ ...form, public_email: e.target.value })} className={`${FIELD} mt-1.5`} />
        </label>
      </div>
      <div className="mt-3.5 flex gap-3">
        <label className="flex-1">
          <span className={LABEL}>{t("biz.address")}</span>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={`${FIELD} mt-1.5`} />
        </label>
        <label className="flex-1">
          <span className={LABEL}>{t("biz.area")}</span>
          <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className={`${FIELD} mt-1.5`} />
        </label>
      </div>
      <div className="mt-3.5 flex gap-3">
        <label className="flex-1">
          <span className={LABEL}>{t("owner.profile.website")}</span>
          <input value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} placeholder="https://…" className={`${FIELD} mt-1.5`} />
        </label>
        <label className="flex-1">
          <span className={LABEL}>{t("biz.instagram")}</span>
          <input value={form.instagram_url} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} placeholder={t("owner.profile.instagramPlaceholder")} className={`${FIELD} mt-1.5`} />
        </label>
      </div>
      <div className="mt-3.5 flex gap-3">
        <label className="flex-1">
          <span className={LABEL}>{t("owner.profile.city")}</span>
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={`${FIELD} mt-1.5`} />
        </label>
        {/* Compact hours summary — opens the full per-day editor in a dialog. */}
        <div className="flex-1">
          <span className={LABEL}>{t("owner.profile.hours")}</span>
          <button
            type="button"
            onClick={() => setHoursOpen(true)}
            className={`${FIELD} mt-1.5 flex items-center justify-between gap-2 text-left`}
          >
            <span className={`truncate ${hoursSummary ? "" : "text-subtle"}`}>
              {hoursSummary || t("owner.settings.hours.notSet")}
            </span>
            <span aria-hidden className="flex-none text-subtle">
              ✎
            </span>
          </button>
        </div>
      </div>

      <Dialog
        open={hoursOpen}
        onOpenChange={setHoursOpen}
        title={t("owner.profile.hours")}
        ariaLabel={t("owner.profile.hours")}
      >
        <WeekHoursEditor value={form.week} onChange={(week) => setForm({ ...form, week })} />
        <button
          type="button"
          onClick={() => setHoursOpen(false)}
          className="mt-4 w-full rounded-[14px] bg-brand py-3 text-[14px] font-bold text-brand-fg shadow-glow transition hover:brightness-105"
        >
          {t("common.close")}
        </button>
      </Dialog>
      {/* Coordinates are set by the map below (search / drag / tap), never typed —
          so they're shown read-only, not as editable fields. */}
      <div className="mt-3.5">
        <span className={LABEL}>{t("owner.profile.pickMap")}</span>
        <div className="mt-1.5">
          <LocationPicker
            lat={form.lat}
            lng={form.lng}
            onChange={(pickedLat, pickedLng, pickedAddress) =>
              setForm((f) => ({
                ...f,
                lat: String(pickedLat),
                lng: String(pickedLng),
                address: pickedAddress ?? f.address,
              }))
            }
          />
        </div>
        {coord(form.lat) && coord(form.lng) ? (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-[#F4ECDF] px-3 py-1.5 text-[12.5px] font-semibold text-subtle">
            <span aria-hidden>📍</span>
            {coord(form.lat)}, {coord(form.lng)}
          </div>
        ) : (
          <div className="mt-2 text-[12.5px] text-subtle">{t("owner.settings.coordsEmpty")}</div>
        )}
      </div>
      <SaveButton onClick={save} pending={update.isPending} />
    </SectionCard>
  );
}
