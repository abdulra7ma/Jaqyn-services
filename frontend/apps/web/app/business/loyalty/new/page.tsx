"use client";

import { useCatalog, useCreateLoyaltyProgram, type LoyaltyType } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useErrMessage } from "../../../_lib/useErrMessage";
import { OwnerShell } from "../../_components/OwnerShell";
import { LOYALTY_TYPE_GLYPH } from "../../_components/loyalty";

const LOYALTY_TYPES: LoyaltyType[] = ["points", "stamp", "visit"];
const STEPS = ["type", "mechanics", "reward", "review"] as const;
type Step = 0 | 1 | 2 | 3;

const LABEL = "text-[12px] font-bold text-subtle";
const FIELD =
  "mt-1.5 w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 text-sm font-semibold text-ink outline-none focus:border-brand";
const PANEL = "rounded-[20px] border border-line bg-card p-6";

type Form = {
  type: LoyaltyType;
  name: string;
  basis: "visit" | "spend";
  rate: string;
  cashback: string;
  minimum: string;
  target: string;
  maxBanked: string;
  reward: string;
  itemMode: "fixed" | "customer";
  item: string;
  expiryDays: string;
};

const DEFAULT: Form = {
  type: "points",
  name: "",
  basis: "spend",
  rate: "0.05",
  cashback: "1",
  minimum: "10",
  target: "6",
  maxBanked: "2",
  reward: "",
  itemMode: "customer",
  item: "",
  expiryDays: "90",
};

function validateForm(f: Form): string | null {
  if (!f.name.trim()) return "loyalty.biz.form.invalid.name";
  if (f.type !== "points" && !f.reward.trim()) return "loyalty.biz.form.invalid.reward";
  if (f.type !== "points" && f.itemMode === "fixed" && !f.item) return "loyalty.biz.form.invalid.item";
  return null;
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric" | "text";
  placeholder?: string;
}) {
  return (
    <label className="block flex-1">
      <span className={LABEL}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        placeholder={placeholder}
        className={FIELD}
      />
    </label>
  );
}

// ---- Step 0: Type -----------------------------------------------------------

function TypeCard({ type, active, onPick }: { type: LoyaltyType; active: boolean; onPick: () => void }) {
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
        {LOYALTY_TYPE_GLYPH[type]}
      </span>
      <span className="flex-1">
        <span className="block font-display text-[15px] font-bold text-ink">{t(`loyalty.biz.new.type.${type}`)}</span>
        <span className="mt-1 block text-[12.5px] text-subtle">{t(`loyalty.biz.new.type.${type}Desc`)}</span>
      </span>
    </button>
  );
}

function StepType({ form, set }: { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  const t = useT();
  return (
    <div className={PANEL}>
      <h2 className="font-display text-[17px] font-bold text-ink">{t("loyalty.biz.new.typeTitle")}</h2>
      <div className="mt-4 flex flex-col gap-2.5">
        {LOYALTY_TYPES.map((type) => (
          <TypeCard key={type} type={type} active={form.type === type} onPick={() => set("type", type)} />
        ))}
      </div>
    </div>
  );
}

// ---- Step 1: Mechanics ------------------------------------------------------

function StepMechanics({ form, set }: { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  const t = useT();
  const title =
    form.type === "points"
      ? t("loyalty.biz.mech.pointsTitle")
      : form.type === "stamp"
        ? t("loyalty.biz.mech.stampTitle")
        : t("loyalty.biz.mech.visitTitle");
  const sub = form.type === "points" ? t("loyalty.biz.mech.pointsSub") : t("loyalty.biz.mech.countSub");

  return (
    <div className={PANEL}>
      <h2 className="font-display text-[17px] font-bold text-ink">{title}</h2>
      <p className="mt-1 text-[13px] text-subtle">{sub}</p>

      <div className="mt-5 flex flex-col gap-4">
        <Field label={t("loyalty.biz.name")} value={form.name} onChange={(v) => set("name", v)} />

        {form.type === "points" ? (
          <>
            <label className="block">
              <span className={LABEL}>{t("loyalty.biz.basis")}</span>
              <select
                value={form.basis}
                onChange={(e) => set("basis", e.target.value as "visit" | "spend")}
                className={FIELD}
              >
                <option value="visit">{t("loyalty.biz.perVisit")}</option>
                <option value="spend">{t("loyalty.biz.perSpend")}</option>
              </select>
            </label>
            <div className="flex gap-3">
              <Field
                label={form.basis === "visit" ? t("loyalty.biz.mech.ratePerVisit") : t("loyalty.biz.mech.ratePerSom")}
                value={form.rate}
                onChange={(v) => set("rate", v)}
                inputMode="numeric"
              />
              <Field
                label={t("loyalty.biz.cashbackRate")}
                value={form.cashback}
                onChange={(v) => set("cashback", v)}
                inputMode="numeric"
              />
            </div>
            <Field
              label={t("loyalty.biz.minimum")}
              value={form.minimum}
              onChange={(v) => set("minimum", v)}
              inputMode="numeric"
            />
            {Number(form.rate) > 0 && Number(form.cashback) > 0 && (
              <p className="text-[13px] font-semibold text-brand">
                ≈ {(Number(form.rate) * Number(form.cashback) * 100).toFixed(1)}% {t("loyalty.biz.mech.back")}
              </p>
            )}
          </>
        ) : (
          <div className="flex gap-3">
            <Field
              label={form.type === "stamp" ? t("loyalty.biz.mech.stampCount") : t("loyalty.biz.mech.visitCount")}
              value={form.target}
              onChange={(v) => set("target", v)}
              inputMode="numeric"
            />
            {form.type === "stamp" && (
              <Field
                label={t("loyalty.biz.maxBanked")}
                value={form.maxBanked}
                onChange={(v) => set("maxBanked", v)}
                inputMode="numeric"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Step 2: Reward ---------------------------------------------------------

function ItemModeCard({
  active,
  title,
  sub,
  onPick,
}: {
  active: boolean;
  title: string;
  sub: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={`flex-1 rounded-2xl border-[1.5px] p-3.5 text-left transition ${
        active ? "border-brand bg-brand-muted/40" : "border-line bg-card hover:border-brand/40"
      }`}
    >
      <span className="block text-[13.5px] font-bold text-ink">{title}</span>
      <span className="mt-0.5 block text-[12px] text-subtle">{sub}</span>
    </button>
  );
}

function StepReward({ form, set }: { form: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  const t = useT();
  const catalog = useCatalog();
  const placeholder =
    form.type === "points"
      ? t("loyalty.biz.rewardStep.phPoints")
      : form.type === "stamp"
        ? t("loyalty.biz.rewardStep.phStamp")
        : t("loyalty.biz.rewardStep.phVisit");

  return (
    <div className={PANEL}>
      <h2 className="font-display text-[17px] font-bold text-ink">{t("loyalty.biz.rewardStep.title")}</h2>
      <div className="mt-4 flex flex-col gap-4">
        <Field
          label={t("loyalty.biz.rewardStep.titleLabel")}
          value={form.reward}
          onChange={(v) => set("reward", v)}
          placeholder={placeholder}
        />

        {form.type !== "points" && (
          <>
            <div>
              <span className={LABEL}>{t("loyalty.biz.rewardStep.itemMode")}</span>
              <div className="mt-1.5 flex gap-3">
                <ItemModeCard
                  active={form.itemMode === "customer"}
                  title={t("loyalty.biz.rewardStep.choice")}
                  sub={t("loyalty.biz.rewardStep.choiceSub")}
                  onPick={() => set("itemMode", "customer")}
                />
                <ItemModeCard
                  active={form.itemMode === "fixed"}
                  title={t("loyalty.biz.rewardStep.fixed")}
                  sub={t("loyalty.biz.rewardStep.fixedSub")}
                  onPick={() => set("itemMode", "fixed")}
                />
              </div>
            </div>
            {form.itemMode === "fixed" && (
              <label className="block">
                <span className={LABEL}>{t("loyalty.biz.rewardStep.catalogItem")}</span>
                <select value={form.item} onChange={(e) => set("item", e.target.value)} className={FIELD}>
                  <option value="">{t("loyalty.biz.rewardStep.selectItem")}</option>
                  {(catalog.data ?? []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Field
              label={t("loyalty.biz.rewardStep.expiry")}
              value={form.expiryDays}
              onChange={(v) => set("expiryDays", v)}
              inputMode="numeric"
            />
          </>
        )}
      </div>
    </div>
  );
}

// ---- Step 3: Review ---------------------------------------------------------

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 px-1 py-2.5 text-[13.5px]">
      <span className="text-subtle">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

function StepReview({ form }: { form: Form }) {
  const t = useT();
  const backPct = (Number(form.rate) * Number(form.cashback) * 100).toFixed(1);

  const rows: Array<{ label: string; value: string }> = [
    { label: t("loyalty.biz.settings.label.type"), value: t(`loyalty.biz.${form.type}`) },
    { label: t("loyalty.biz.name"), value: form.name || "—" },
  ];
  if (form.type === "points") {
    rows.push(
      {
        label: t("loyalty.biz.settings.label.earnBasis"),
        value: form.basis === "visit" ? t("loyalty.biz.perVisit") : t("loyalty.biz.perSpend"),
      },
      { label: t("loyalty.biz.settings.label.rate"), value: form.rate },
      { label: t("loyalty.biz.settings.label.cashback"), value: `${form.cashback} · ${backPct}%` },
      { label: t("loyalty.biz.settings.label.minRedeem"), value: form.minimum },
    );
  } else {
    rows.push(
      { label: t("loyalty.biz.target"), value: form.target },
      ...(form.type === "stamp" ? [{ label: t("loyalty.biz.maxBanked"), value: form.maxBanked }] : []),
      { label: t("loyalty.biz.reward"), value: form.reward || "—" },
      { label: t("loyalty.biz.settings.label.validity"), value: form.expiryDays },
    );
  }

  return (
    <div className={PANEL}>
      <h2 className="font-display text-[17px] font-bold text-ink">{t("loyalty.biz.wiz.step.review")}</h2>
      <div className="mt-4 divide-y divide-[#F4ECDF]">
        {rows.map((r, i) => (
          <ReviewRow key={i} label={r.label} value={r.value} />
        ))}
      </div>
    </div>
  );
}

// ---- Page -------------------------------------------------------------------

export default function NewLoyaltyPage() {
  const t = useT();
  const router = useRouter();
  const create = useCreateLoyaltyProgram();
  const errMessage = useErrMessage();
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState<Form>(DEFAULT);

  function set<K extends keyof Form>(key: K, val: Form[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  const invalidKey = validateForm(form);

  function onSubmit() {
    if (invalidKey) return;
    const base = { type: form.type, name: form.name.trim(), description: "" };
    const payload =
      form.type === "points"
        ? {
            ...base,
            points_basis: form.basis,
            points_per_visit: form.basis === "visit" ? Number(form.rate) : null,
            points_per_som: form.basis === "spend" ? form.rate : null,
            cashback_per_point: form.cashback,
            min_redeem_points: Number(form.minimum),
          }
        : {
            ...base,
            required_count: Number(form.target),
            max_banked: form.type === "stamp" ? Number(form.maxBanked) : null,
            reward_type: "free_item" as const,
            reward_title: form.reward.trim(),
            reward_description: "",
            reward_expiry_days: Number(form.expiryDays) || 30,
            item_selection: form.itemMode,
            catalog_item_id: form.itemMode === "fixed" ? form.item || null : null,
          };
    create.mutate(payload, { onSuccess: (program) => router.push(`/business/loyalty/${program.id}`) });
  }

  const isLast = step === 3;

  return (
    <OwnerShell title={t("loyalty.biz.new")}>
      <div className="flex animate-[jqIn_.3s_ease] flex-col gap-6 lg:flex-row lg:items-start lg:gap-[26px]">
        {/* stepper */}
        <div className="flex-none lg:w-[200px]">
          <button
            onClick={() => router.push("/business/loyalty")}
            className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-subtle"
          >
            {t("loyalty.biz.back")}
          </button>
          <ol className="flex gap-2 lg:flex-col lg:gap-1">
            {STEPS.map((s, i) => {
              const current = i === step;
              const done = i < step;
              return (
                <li key={s}>
                  <button
                    onClick={() => i <= step && setStep(i as Step)}
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
                    {t(`loyalty.biz.wiz.step.${s}`)}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {/* body */}
        <div className="min-w-0 flex-1 lg:max-w-[640px]">
          {step === 0 && <StepType form={form} set={set} />}
          {step === 1 && <StepMechanics form={form} set={set} />}
          {step === 2 && <StepReward form={form} set={set} />}
          {step === 3 && <StepReview form={form} />}

          {isLast && create.isError && (
            <p className="mt-3 text-[12.5px] font-semibold text-danger">{errMessage(create.error)}</p>
          )}
          {isLast && invalidKey && (
            <p className="mt-3 text-[12.5px] font-semibold text-danger">{t(invalidKey)}</p>
          )}

          <div className="mt-[18px] flex gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep((step - 1) as Step)}
                className="rounded-xl border-[1.5px] border-line bg-card px-[22px] py-3.5 text-sm font-semibold text-ink"
              >
                {t("loyalty.biz.wiz.back")}
              </button>
            )}
            {!isLast ? (
              <button
                onClick={() => setStep((step + 1) as Step)}
                className="flex-1 rounded-xl bg-brand py-3.5 text-[14.5px] font-bold text-brand-fg shadow-glow transition active:scale-[.99]"
              >
                {t("loyalty.biz.wiz.next")}
              </button>
            ) : (
              <button
                onClick={onSubmit}
                disabled={!!invalidKey || create.isPending}
                className="flex-1 rounded-xl bg-brand py-3.5 text-[14.5px] font-bold text-brand-fg shadow-glow transition active:scale-[.99] disabled:opacity-60"
              >
                {create.isPending ? t("loyalty.biz.form.creating") : t("loyalty.biz.wiz.publish")}
              </button>
            )}
          </div>
        </div>
      </div>
    </OwnerShell>
  );
}
