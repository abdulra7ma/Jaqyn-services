"use client";

// Business campaigns — Create wizard (plan §2.4, design BUSINESS · create). Five
// steps with a stepper: type → rules → reward → limits → review. Form lives in
// co-located UI state; client-side validation (publishError) mirrors the backend
// publish rules for UX — the service is the authority. Publish calls useCreateCampaign
// and routes to the new campaign's detail.

import { useCreateCampaign, type BusinessCampaignType } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { OwnerShell } from "../../_components/OwnerShell";
import { useErrMessage } from "../../../_lib/useErrMessage";
import { useRequireAuth } from "../../../_lib/auth";
import {
  CAMPAIGN_TYPES,
  REWARD_TYPES,
  TYPE_GLYPH,
  WIZARD_DEFAULT,
  WIZARD_STEPS,
  publishError,
  ruleSummary,
  toPayload,
  type RewardType,
  type WizardForm,
  type WizardStep,
} from "../../_components/campaigns";

const LABEL = "text-[12px] font-bold text-subtle";
const FIELD =
  "mt-1.5 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-brand";

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

export default function NewCampaignPage() {
  const t = useT();
  const router = useRouter();
  const errMessage = useErrMessage();
  const { isAuthenticated, ready } = useRequireAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<WizardForm>(WIZARD_DEFAULT);
  const create = useCreateCampaign();

  const step: WizardStep = WIZARD_STEPS[stepIndex]!;
  const isLast = stepIndex === WIZARD_STEPS.length - 1;
  const set = <K extends keyof WizardForm>(key: K, val: WizardForm[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const invalidKey = useMemo(() => publishError(form), [form]);

  // Estimated max cost shown on the limits step (design wizEstCost): max rewards
  // times a nominal unit. We don't have a per-unit cost input in the wizard, so we
  // present the count and let the review reflect the explicit fields.
  const estCost = useMemo(() => {
    const max = Number.parseInt(form.maxRewards, 10);
    return Number.isFinite(max) ? `${max} × ${t("cmp.biz.wiz.maxRewards").toLowerCase()}` : "—";
  }, [form.maxRewards, t]);

  function onNext() {
    if (isLast) {
      if (invalidKey) return; // review step surfaces the message
      create.mutate(toPayload(form), {
        onSuccess: (c) => router.replace(`/business/campaigns/${c.id}`),
      });
      return;
    }
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  }

  function onBack() {
    if (stepIndex === 0) router.push("/business/campaigns");
    else setStepIndex((i) => i - 1);
  }

  return (
    <OwnerShell title={t("cmp.biz.create")}>
      {!ready || !isAuthenticated ? null : (
        <div className="flex animate-[jqIn_.3s_ease] flex-col gap-6 lg:flex-row lg:items-start lg:gap-[26px]">
          {/* stepper */}
          <div className="flex-none lg:w-[200px]">
            <button
              onClick={() => router.push("/business/campaigns")}
              className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-subtle"
            >
              {t("cmp.biz.wiz.cancel")}
            </button>
            <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
              {WIZARD_STEPS.map((s, i) => {
                const done = i < stepIndex;
                const current = i === stepIndex;
                return (
                  <li key={s}>
                    <button
                      onClick={() => i <= stepIndex && setStepIndex(i)}
                      disabled={i > stepIndex}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition ${
                        current ? "bg-brand-muted text-brand-deep" : "text-subtle"
                      } ${i > stepIndex ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <span
                        className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-extrabold ${
                          current || done ? "bg-brand text-brand-fg" : "bg-board text-subtle"
                        }`}
                      >
                        {done ? "✓" : i + 1}
                      </span>
                      {t(`cmp.biz.wiz.step.${s}`)}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* step body */}
          <div className="min-w-0 flex-1 lg:max-w-[640px]">
            {step === "type" && <StepType form={form} set={set} />}
            {step === "rules" && <StepRules form={form} set={set} />}
            {step === "reward" && <StepReward form={form} set={set} />}
            {step === "limits" && <StepLimits form={form} set={set} estCost={estCost} />}
            {step === "review" && <StepReview form={form} invalidKey={invalidKey} />}

            {create.isError && (
              <p className="mt-3 text-[12.5px] font-semibold text-danger">
                {errMessage(create.error)}
              </p>
            )}

            <div className="mt-[18px] flex gap-3">
              <button
                onClick={onBack}
                className="rounded-xl border-[1.5px] border-line bg-card px-[22px] py-3.5 text-sm font-semibold text-ink"
              >
                {stepIndex === 0 ? t("common.cancel") : t("cmp.biz.wiz.back")}
              </button>
              <button
                onClick={onNext}
                disabled={isLast && (!!invalidKey || create.isPending)}
                className="flex-1 rounded-xl bg-brand py-3.5 text-[14.5px] font-bold text-brand-fg shadow-glow transition active:scale-[.99] disabled:opacity-60"
              >
                {isLast
                  ? create.isPending
                    ? t("cmp.biz.wiz.publishing")
                    : t("cmp.biz.wiz.publish")
                  : t("cmp.biz.wiz.next")}
              </button>
            </div>
          </div>
        </div>
      )}
    </OwnerShell>
  );
}

// ---- steps -----------------------------------------------------------------

type SetFn = <K extends keyof WizardForm>(key: K, val: WizardForm[K]) => void;

const PANEL = "rounded-[20px] border border-line bg-card p-6";

function StepType({ form, set }: { form: WizardForm; set: SetFn }) {
  const t = useT();
  return (
    <div className={PANEL}>
      <h2 className="font-display text-[17px] font-bold text-ink">{t("cmp.biz.wiz.typeTitle")}</h2>
      <p className="mt-1 text-[13px] text-subtle">{t("cmp.biz.wiz.typeHint")}</p>
      <div className="mt-4 flex flex-col gap-2.5">
        {CAMPAIGN_TYPES.map((type: BusinessCampaignType) => {
          const active = form.type === type;
          return (
            <button
              key={type}
              onClick={() => set("type", type)}
              aria-pressed={active}
              className={`flex items-center gap-3.5 rounded-2xl border-[1.5px] p-3.5 text-left transition ${
                active ? "border-brand bg-brand-muted/40" : "border-line bg-card"
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {TYPE_GLYPH[type]}
              </span>
              <span className="flex-1">
                <span className="block font-display text-[15px] font-bold text-ink">
                  {t(`cmp.biz.wiz.type.${type}`)}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-subtle">
                  {t(`cmp.biz.wiz.type.${type}Desc`)}
                </span>
              </span>
              <span
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${
                  active ? "bg-brand text-brand-fg" : "border border-line text-transparent"
                }`}
                aria-hidden
              >
                ✓
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-5">
        <Field
          label={t("cmp.biz.wiz.name")}
          value={form.name}
          onChange={(v) => set("name", v)}
          placeholder={t("cmp.biz.wiz.namePlaceholder")}
        />
      </div>
      <label className="mt-3.5 block">
        <span className={LABEL}>{t("cmp.biz.wiz.desc")}</span>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          placeholder={t("cmp.biz.wiz.descPlaceholder")}
          className={`${FIELD} resize-none leading-relaxed`}
        />
      </label>
    </div>
  );
}

function StepRules({ form, set }: { form: WizardForm; set: SetFn }) {
  const t = useT();
  const isGroup = form.type === "group";
  return (
    <div className={PANEL}>
      <h2 className="font-display text-[17px] font-bold text-ink">{t("cmp.biz.wiz.rulesTitle")}</h2>
      <p className="mt-1 text-[13px] text-subtle">
        {t(isGroup ? "cmp.biz.wiz.rulesHintGroup" : "cmp.biz.wiz.rulesHintVisit")}
      </p>

      {isGroup ? (
        <div className="mt-4 flex gap-3.5">
          <Field
            label={t("cmp.biz.wiz.groupSize")}
            value={form.groupSize}
            onChange={(v) => set("groupSize", v)}
            inputMode="numeric"
          />
          <Field
            label={t("cmp.biz.wiz.checkin")}
            value={form.checkin}
            onChange={(v) => set("checkin", v)}
          />
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-3.5">
            <Field
              label={t("cmp.biz.wiz.visits")}
              value={form.visits}
              onChange={(v) => set("visits", v)}
              inputMode="numeric"
            />
            <Field
              label={t("cmp.biz.wiz.perDay")}
              value={form.perDay}
              onChange={(v) => set("perDay", v)}
              inputMode="numeric"
            />
          </div>
          <div className="mt-3.5 flex gap-3.5">
            <Field
              label={t("cmp.biz.wiz.minGap")}
              value={form.minGap}
              onChange={(v) => set("minGap", v)}
            />
            {form.type === "timewindow" && (
              <Field
                label={t("cmp.biz.wiz.windowBefore")}
                value={form.windowBefore}
                onChange={(v) => set("windowBefore", v)}
                placeholder="12:00"
              />
            )}
          </div>
        </>
      )}

      <div className="mt-4 flex gap-3.5">
        <Field label={t("cmp.biz.wiz.start")} value={form.start} onChange={(v) => set("start", v)} />
        <Field label={t("cmp.biz.wiz.end")} value={form.end} onChange={(v) => set("end", v)} />
      </div>
      <div className="mt-3.5 flex gap-3.5">
        <Field label={t("cmp.biz.wiz.days")} value={form.days} onChange={(v) => set("days", v)} />
        <Field label={t("cmp.biz.wiz.hours")} value={form.hours} onChange={(v) => set("hours", v)} />
      </div>
    </div>
  );
}

function StepReward({ form, set }: { form: WizardForm; set: SetFn }) {
  const t = useT();
  return (
    <div className={PANEL}>
      <h2 className="font-display text-[17px] font-bold text-ink">{t("cmp.biz.wiz.rewardTitle")}</h2>
      <p className="mt-1 text-[13px] text-subtle">{t("cmp.biz.wiz.rewardHint")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {REWARD_TYPES.map((rt: RewardType) => {
          const active = form.rewardType === rt;
          return (
            <button
              key={rt}
              onClick={() => set("rewardType", rt)}
              aria-pressed={active}
              className={`rounded-xl border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition ${
                active ? "border-brand bg-brand-muted text-brand-deep" : "border-line bg-card text-subtle"
              }`}
            >
              {t(`cmp.biz.wiz.rewardType.${rt}`)}
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <Field
          label={t("cmp.biz.wiz.rewardTitleLabel")}
          value={form.rewardTitle}
          onChange={(v) => set("rewardTitle", v)}
          placeholder={t("cmp.biz.wiz.rewardTitlePlaceholder")}
        />
      </div>
      <div className="mt-3.5">
        <Field
          label={t("cmp.biz.wiz.rewardDesc")}
          value={form.rewardDescription}
          onChange={(v) => set("rewardDescription", v)}
          placeholder={t("cmp.biz.wiz.rewardDescPlaceholder")}
        />
      </div>
      <div className="mt-3.5 flex gap-3.5">
        <Field
          label={t("cmp.biz.wiz.expiryDays")}
          value={form.expiryDays}
          onChange={(v) => set("expiryDays", v)}
          inputMode="numeric"
        />
        <Field
          label={t("cmp.biz.wiz.maxRewards")}
          value={form.maxRewards}
          onChange={(v) => set("maxRewards", v)}
          inputMode="numeric"
        />
      </div>
    </div>
  );
}

function StepLimits({
  form,
  set,
  estCost,
}: {
  form: WizardForm;
  set: SetFn;
  estCost: string;
}) {
  const t = useT();
  return (
    <div className={PANEL}>
      <h2 className="font-display text-[17px] font-bold text-ink">{t("cmp.biz.wiz.limitsTitle")}</h2>
      <p className="mt-1 text-[13px] text-subtle">{t("cmp.biz.wiz.limitsHint")}</p>
      <div className="mt-4 flex gap-3.5">
        <Field
          label={t("cmp.biz.wiz.maxParticipants")}
          value={form.maxParticipants}
          onChange={(v) => set("maxParticipants", v)}
          inputMode="numeric"
        />
        <div className="flex-1">
          <span className={LABEL}>{t("cmp.biz.wiz.repeat")}</span>
          <div className="mt-1.5 flex gap-1.5">
            {(["once", "repeatable"] as const).map((rp) => {
              const active = form.repeatPolicy === rp;
              return (
                <button
                  key={rp}
                  onClick={() => set("repeatPolicy", rp)}
                  aria-pressed={active}
                  className={`flex-1 rounded-xl border-[1.5px] px-2 py-3 text-[12.5px] font-semibold transition ${
                    active
                      ? "border-brand bg-brand-muted text-brand-deep"
                      : "border-line bg-card text-subtle"
                  }`}
                >
                  {t(`cmp.biz.wiz.repeat.${rp}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-xl bg-amber/12 px-4 py-3.5 text-[13px] leading-snug text-amber-deep">
        <span className="text-xl" aria-hidden>
          💰
        </span>
        <span>{t("cmp.biz.wiz.estCost").replace("{cost}", estCost)}</span>
      </div>
      <button
        onClick={() => set("staffApproval", !form.staffApproval)}
        aria-pressed={form.staffApproval}
        className="mt-4 flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3.5 text-left"
      >
        <span
          className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-xs font-bold ${
            form.staffApproval ? "bg-brand text-brand-fg" : "border border-line text-transparent"
          }`}
          aria-hidden
        >
          ✓
        </span>
        <span className="flex-1">
          <span className="block text-[13.5px] font-bold text-ink">
            {t("cmp.biz.wiz.staffApproval")}
          </span>
          <span className="mt-0.5 block text-xs text-subtle">
            {t("cmp.biz.wiz.staffApprovalHint")}
          </span>
        </span>
      </button>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 bg-card px-4 py-3.5 text-[13.5px]">
      <span className="text-subtle">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

function StepReview({ form, invalidKey }: { form: WizardForm; invalidKey: string | null }) {
  const t = useT();
  const payload = toPayload(form);
  const reward = `${form.rewardTitle || "—"}${
    form.rewardDescription ? ` · ${form.rewardDescription}` : ""
  }`;
  return (
    <div className={PANEL}>
      <h2 className="font-display text-[17px] font-bold text-ink">{t("cmp.biz.wiz.reviewTitle")}</h2>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[linear-gradient(120deg,#3C2E22,#5A4330)] p-[18px] text-white">
        <div
          className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-xl bg-white/15 text-2xl"
          aria-hidden
        >
          {TYPE_GLYPH[form.type]}
        </div>
        <div>
          <div className="font-display text-lg font-bold">{form.name || t("cmp.biz.wiz.name")}</div>
          <div className="mt-0.5 text-[12.5px] opacity-85">{t(`cmp.biz.wiz.type.${form.type}`)}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
        <ReviewRow label={t("cmp.biz.wiz.review.type")} value={t(`cmp.biz.wiz.type.${form.type}`)} />
        <ReviewRow label={t("cmp.biz.wiz.review.challenge")} value={ruleSummary(t, form.type, payload)} />
        <ReviewRow label={t("cmp.biz.wiz.review.reward")} value={reward} />
        <ReviewRow
          label={t("cmp.biz.wiz.review.dates")}
          value={`${form.start || "—"} – ${form.end || "—"} · ${form.days}`}
        />
        <ReviewRow
          label={t("cmp.biz.wiz.review.limits")}
          value={`${form.maxRewards} · ${t(`cmp.biz.wiz.repeat.${form.repeatPolicy}`)}`}
        />
      </div>

      {invalidKey && (
        <div className="mt-3.5 flex items-center gap-2.5 rounded-xl bg-brand-muted px-3.5 py-3 text-[12.5px] font-semibold text-danger">
          <span aria-hidden>⚠</span>
          {t(invalidKey)}
        </div>
      )}
    </div>
  );
}
