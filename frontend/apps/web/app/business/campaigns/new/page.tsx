"use client";

// Business campaigns — create flow (campaigns-restructure design §6 / §6a). Two
// steps: (1) an OUTCOME chooser (outcome label + technical type subtitle) plus
// starter templates that prefill the form, and (2) ONE adaptive form whose fields
// follow the chosen type/mechanic. Client-side validation (createError) mirrors the
// backend publish rules for UX — the service is the authority. Submit calls
// useCreateCampaign and routes to the new campaign's detail.

import {
  businessApi,
  useCatalog,
  useCreateCampaign,
  type BusinessCampaignType,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { OwnerShell } from "../../_components/OwnerShell";
import { useErrMessage } from "../../../_lib/useErrMessage";
import {
  CAMPAIGN_FORM_DEFAULT,
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_TYPES,
  TYPE_GLYPH,
  applyTemplate,
  createError,
  toPayload,
  type CampaignForm,
  type CampaignTemplate,
} from "../../_components/campaigns";

const LABEL = "text-[12px] font-bold text-subtle";
const FIELD =
  "mt-1.5 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-brand";
const PANEL = "rounded-[20px] border border-line bg-card p-6";

type SetFn = <K extends keyof CampaignForm>(key: K, val: CampaignForm[K]) => void;

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block flex-1">
      <span className={LABEL}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className={FIELD}
      />
    </label>
  );
}

// ---- Step 1: outcome chooser + templates -----------------------------------

function OutcomeCard({
  type,
  active,
  onPick,
}: {
  type: BusinessCampaignType;
  active: boolean;
  onPick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={`flex items-start gap-3.5 rounded-2xl border-[1.5px] p-4 text-left transition ${
        active ? "border-brand bg-brand-muted/40" : "border-line bg-card hover:border-brand/40"
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {TYPE_GLYPH[type]}
      </span>
      <span className="flex-1">
        <span className="block font-display text-[15px] font-bold text-ink">
          {t(`cmp.biz.new.outcome.${type}`)}
        </span>
        <span className="mt-0.5 block text-[12px] font-semibold uppercase tracking-wide text-brand">
          {t(`cmp.biz.new.outcome.${type}Type`)}
        </span>
        <span className="mt-1 block text-[12.5px] text-subtle">
          {t(`cmp.biz.new.outcome.${type}One`)}
        </span>
      </span>
    </button>
  );
}

function StepOutcome({
  form,
  onPickType,
  onPickTemplate,
  onScratch,
}: {
  form: CampaignForm;
  onPickType: (type: BusinessCampaignType) => void;
  onPickTemplate: (tpl: CampaignTemplate) => void;
  onScratch: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-5">
      <div className={PANEL}>
        <h2 className="font-display text-[17px] font-bold text-ink">{t("cmp.biz.new.chooseOutcome")}</h2>
        <div className="mt-4 flex flex-col gap-2.5">
          {CAMPAIGN_TYPES.map((type) => (
            <OutcomeCard key={type} type={type} active={form.type === type} onPick={() => onPickType(type)} />
          ))}
        </div>
      </div>

      <div className={PANEL}>
        <h2 className="font-display text-[17px] font-bold text-ink">{t("cmp.biz.new.templates")}</h2>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {CAMPAIGN_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onPickTemplate(tpl)}
              className="flex items-center gap-3 rounded-xl border-[1.5px] border-line bg-card p-3.5 text-left transition hover:border-brand/40"
            >
              <span className="text-xl" aria-hidden>
                {TYPE_GLYPH[tpl.type]}
              </span>
              <span className="text-[13.5px] font-semibold text-ink">{t(tpl.labelKey)}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onScratch}
            className="flex items-center gap-3 rounded-xl border-[1.5px] border-dashed border-line bg-card p-3.5 text-left transition hover:border-brand/40"
          >
            <span className="text-xl" aria-hidden>
              ✎
            </span>
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">{t("cmp.biz.new.scratch")}</span>
              <span className="block text-xs text-subtle">{t("cmp.biz.new.scratchHint")}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Step 2: adaptive form -------------------------------------------------

/** A two-option pill toggle (basis / item-selection). */
function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="mt-4">
      <span className={LABEL}>{label}</span>
      <div className="mt-1.5 flex gap-1.5">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={`flex-1 rounded-xl border-[1.5px] px-2 py-3 text-[12.5px] font-semibold transition ${
                active ? "border-brand bg-brand-muted text-brand-deep" : "border-line bg-card text-subtle"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Reward-item selection (multi-form-loyalty slice 3): fixed preset item vs
 * customer-chosen. When fixed, a CatalogItem picker fed by the owner's catalog. */
function ItemRewardPicker({ form, set }: { form: CampaignForm; set: SetFn }) {
  const t = useT();
  const catalog = useCatalog();
  return (
    <>
      <Toggle
        label={t("cmp.biz.form.itemSelection")}
        value={form.itemSelection}
        options={[
          { value: "fixed", label: t("cmp.biz.form.item.fixed") },
          { value: "customer", label: t("cmp.biz.form.item.customer") },
        ]}
        onChange={(v) => set("itemSelection", v)}
      />
      {form.itemSelection === "fixed" && (
        <label className="mt-4 block">
          <span className={LABEL}>{t("cmp.biz.form.catalogItem")}</span>
          <select
            value={form.catalogItemId}
            onChange={(e) => set("catalogItemId", e.target.value)}
            className={FIELD}
          >
            <option value="">{t("cmp.biz.form.catalogItem.placeholder")}</option>
            {(catalog.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.price ? ` · ${item.price}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

/** Optional campaign photo picker. Preview is a local blob URL (no network, no
 * CORS); the file is uploaded to the campaign after it is created. */
function PhotoField({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="mt-4">
      <span className={LABEL}>{t("cmp.biz.form.photo")}</span>
      <div className="mt-1.5 flex items-center gap-3.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={t("cmp.social.addPhoto")}
          className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-xl border-[1.5px] border-dashed border-line bg-card text-2xl text-subtle transition hover:border-brand/40"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not remote media
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            "＋"
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-[13px] font-semibold text-brand"
            >
              {preview ? t("cmp.social.changePhoto") : t("cmp.social.addPhoto")}
            </button>
            {preview && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-[13px] font-semibold text-subtle"
              >
                {t("cmp.biz.form.photoRemove")}
              </button>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-subtle">{t("cmp.biz.form.photoHint")}</p>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          onChange(f);
        }}
      />
    </div>
  );
}

function StepDetails({
  form,
  set,
  photo,
  onPhoto,
}: {
  form: CampaignForm;
  set: SetFn;
  photo: File | null;
  onPhoto: (f: File | null) => void;
}) {
  const t = useT();
  return (
    <div className={PANEL}>
      <Field
        label={t("cmp.biz.form.name")}
        value={form.name}
        onChange={(v) => set("name", v)}
        placeholder={t("cmp.biz.form.namePlaceholder")}
      />

      <PhotoField file={photo} onChange={onPhoto} />

      {/* INDIVIDUAL — campaigns are visit-count challenges. */}
      {form.type === "individual" && (
        <div className="mt-4">
          <Field
            label={t("cmp.biz.form.requiredVisits")}
            value={form.requiredCount}
            onChange={(v) => set("requiredCount", v)}
            inputMode="numeric"
          />
        </div>
      )}

      {/* GROUP — size + check-in window */}
      {form.type === "group" && (
        <div className="mt-4 flex gap-3.5">
          <Field
            label={t("cmp.biz.form.groupSize")}
            value={form.groupSize}
            onChange={(v) => set("groupSize", v)}
            inputMode="numeric"
          />
          <Field
            label={t("cmp.biz.form.checkinWindow")}
            value={form.checkinWindow}
            onChange={(v) => set("checkinWindow", v)}
            inputMode="numeric"
          />
        </div>
      )}

      {/* SOCIAL — Instagram handle */}
      {form.type === "social" && (
        <div className="mt-4">
          <Field
            label={t("cmp.biz.form.instagram")}
            value={form.instagram}
            onChange={(v) => set("instagram", v)}
            placeholder={t("cmp.biz.form.instagramPlaceholder")}
          />
        </div>
      )}

      {/* Reward + limits (all types) */}
      <div className="mt-5 border-t border-[#F4ECDF] pt-5">
        <span className={LABEL}>{t("cmp.biz.form.reward")}</span>
        <Field
          label={t("cmp.biz.form.rewardTitle")}
          value={form.rewardTitle}
          onChange={(v) => set("rewardTitle", v)}
          placeholder={t("cmp.biz.form.rewardTitlePlaceholder")}
        />
        {form.type === "individual" && (
          <ItemRewardPicker form={form} set={set} />
        )}
      </div>
      <div className="mt-4 flex items-end gap-3.5">
        <Field
          label={t("cmp.biz.form.maxParticipants")}
          value={form.maxParticipants}
          onChange={(v) => set("maxParticipants", v)}
          inputMode="numeric"
        />
        <button
          type="button"
          onClick={() => set("repeatable", !form.repeatable)}
          aria-pressed={form.repeatable}
          className="flex flex-1 items-center gap-2.5 rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-left"
        >
          <span
            className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-xs font-bold ${
              form.repeatable ? "bg-brand text-brand-fg" : "border border-line text-transparent"
            }`}
            aria-hidden
          >
            ✓
          </span>
          <span className="text-[13.5px] font-semibold text-ink">{t("cmp.biz.form.repeat")}</span>
        </button>
      </div>
    </div>
  );
}

export default function NewCampaignPage() {
  const t = useT();
  const router = useRouter();
  const errMessage = useErrMessage();

  const [step, setStep] = useState<0 | 1>(0);
  const [form, setForm] = useState<CampaignForm>(CAMPAIGN_FORM_DEFAULT);
  const [photo, setPhoto] = useState<File | null>(null);
  // Set while the campaign is created and its (optional) photo uploaded, so the
  // submit button stays busy across both requests before we navigate away.
  const [submitting, setSubmitting] = useState(false);
  // Holds the created campaign id when the campaign saved but its photo upload
  // failed — so the owner can retry the photo or continue without losing the
  // already-created campaign (we must not re-run create and duplicate it).
  const [photoFailedId, setPhotoFailedId] = useState<string | null>(null);
  const create = useCreateCampaign();

  const set: SetFn = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const invalidKey = useMemo(() => createError(form), [form]);

  function pickType(type: BusinessCampaignType) {
    setForm((f) => ({ ...f, type }));
    setStep(1);
  }
  function pickTemplate(tpl: CampaignTemplate) {
    setForm(applyTemplate(tpl));
    setStep(1);
  }
  function scratch() {
    setForm(CAMPAIGN_FORM_DEFAULT);
    setStep(1);
  }

  // Upload the (optional) photo onto an already-created campaign, then navigate.
  // On failure keep the id so the UI can offer retry/continue — never silently
  // drop the photo the owner deliberately attached.
  async function uploadThenGo(id: string) {
    if (!photo) {
      router.replace(`/business/campaigns/${id}`);
      return;
    }
    try {
      await businessApi.uploadCampaignImage(id, photo);
      router.replace(`/business/campaigns/${id}`);
    } catch {
      setPhotoFailedId(id);
      setSubmitting(false);
    }
  }

  function onSubmit() {
    if (invalidKey || submitting) return;
    setSubmitting(true);
    setPhotoFailedId(null);
    create.mutate(toPayload(form), {
      onSuccess: (c) => uploadThenGo(c.id),
      onError: () => setSubmitting(false),
    });
  }

  function retryPhoto() {
    if (!photoFailedId || submitting) return;
    setSubmitting(true);
    void uploadThenGo(photoFailedId);
  }

  return (
    <OwnerShell title={t("cmp.biz.create")}>
      <div className="flex animate-[jqIn_.3s_ease] flex-col gap-6 lg:flex-row lg:items-start lg:gap-[26px]">
        {/* stepper */}
        <div className="flex-none lg:w-[200px]">
          <button
            onClick={() => router.push("/business/campaigns")}
            className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-subtle"
          >
            {t("cmp.biz.back")}
          </button>
          <ol className="flex gap-2 lg:flex-col lg:gap-1">
            {(["outcome", "details"] as const).map((s, i) => {
              const current = i === step;
              const done = i < step;
              return (
                <li key={s}>
                  <button
                    onClick={() => i <= step && setStep(i as 0 | 1)}
                    disabled={i > step}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition ${
                      current ? "bg-brand-muted text-brand-deep" : "text-subtle"
                    } ${i > step ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <span
                      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-extrabold ${
                        current || done ? "bg-brand text-brand-fg" : "bg-board text-subtle"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    {t(`cmp.biz.new.step.${s}`)}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* body */}
        <div className="min-w-0 flex-1 lg:max-w-[640px]">
          {step === 0 ? (
            <StepOutcome form={form} onPickType={pickType} onPickTemplate={pickTemplate} onScratch={scratch} />
          ) : (
            <>
              <StepDetails form={form} set={set} photo={photo} onPhoto={setPhoto} />
              {create.isError && (
                <p className="mt-3 text-[12.5px] font-semibold text-danger">{errMessage(create.error)}</p>
              )}
              {invalidKey && (
                <p className="mt-3 text-[12.5px] font-semibold text-danger">{t(invalidKey)}</p>
              )}
              {photoFailedId ? (
                <div className="mt-[18px] rounded-xl border-[1.5px] border-line bg-card p-4">
                  <p className="text-[13px] font-semibold text-ink">{t("cmp.biz.form.photoFailed")}</p>
                  <div className="mt-3 flex gap-3">
                    <button
                      onClick={() => router.replace(`/business/campaigns/${photoFailedId}`)}
                      className="rounded-xl border-[1.5px] border-line bg-card px-[22px] py-3 text-sm font-semibold text-ink"
                    >
                      {t("cmp.biz.form.photoSkip")}
                    </button>
                    <button
                      onClick={retryPhoto}
                      disabled={submitting}
                      className="flex-1 rounded-xl bg-brand py-3 text-sm font-bold text-brand-fg shadow-glow transition active:scale-[.99] disabled:opacity-60"
                    >
                      {submitting ? t("cmp.social.uploading") : t("cmp.biz.form.photoRetry")}
                    </button>
                  </div>
                </div>
              ) : (
              <div className="mt-[18px] flex gap-3">
                <button
                  onClick={() => setStep(0)}
                  className="rounded-xl border-[1.5px] border-line bg-card px-[22px] py-3.5 text-sm font-semibold text-ink"
                >
                  {t("cmp.biz.wiz.back")}
                </button>
                <button
                  onClick={onSubmit}
                  disabled={!!invalidKey || submitting}
                  className="flex-1 rounded-xl bg-brand py-3.5 text-[14.5px] font-bold text-brand-fg shadow-glow transition active:scale-[.99] disabled:opacity-60"
                >
                  {submitting ? t("cmp.biz.form.creating") : t("cmp.biz.form.create")}
                </button>
              </div>
              )}
            </>
          )}
        </div>
      </div>
    </OwnerShell>
  );
}
