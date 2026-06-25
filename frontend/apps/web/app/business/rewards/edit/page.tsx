"use client";

// Edit Loyalty Rules (OwnerShell design, responsive). Loads the program by ?id=,
// edits all reward fields, and saves via PATCH /api/business/rewards/:id/.

import { useBusinessRewards, useUpdateReward, type RewardProgramFull } from "@jaqyn/api";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { OwnerShell } from "../../_components/OwnerShell";

const FIELD =
  "w-full rounded-xl border-[1.5px] border-line bg-card px-3 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand";
const LABEL = "text-xs font-bold text-subtle";

const TYPES = [
  { v: "stamp", label: "Stamp card", unit: "stamps" },
  { v: "visit", label: "Visit", unit: "visits" },
  { v: "spend", label: "Spend", unit: "som" },
  { v: "coupon", label: "Discount", unit: "uses" },
];

type Form = {
  type: string;
  title: string;
  required_count: string;
  reward_description: string;
  minimum_spend: string;
  expiry_days: string;
  max_redemptions_per_customer: string;
  max_banked: string;
  terms: string;
};

function EditInner() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const rewards = useBusinessRewards();
  const update = useUpdateReward();

  const program = rewards.data?.find((r: RewardProgramFull) => r.id === id);
  const [f, setF] = useState<Form>({
    type: "stamp",
    title: "",
    required_count: "",
    reward_description: "",
    minimum_spend: "",
    expiry_days: "",
    max_redemptions_per_customer: "",
    max_banked: "",
    terms: "",
  });
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current || !program) return;
    setF({
      type: program.type,
      title: program.title,
      required_count: program.required_count != null ? String(program.required_count) : "",
      reward_description: program.reward_description ?? "",
      minimum_spend: program.minimum_spend != null ? String(program.minimum_spend) : "",
      expiry_days: program.expiry_days != null ? String(program.expiry_days) : "",
      max_redemptions_per_customer:
        program.max_redemptions_per_customer != null ? String(program.max_redemptions_per_customer) : "",
      max_banked: program.max_banked != null ? String(program.max_banked) : "",
      terms: program.terms ?? "",
    });
    hydrated.current = true;
  }, [program]);

  const unit = TYPES.find((t) => t.v === f.type)?.unit ?? "stamps";
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  function num(v: string): number | null {
    const n = parseFloat(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function save() {
    if (!program) return;
    if (!f.title.trim()) return setError("Enter a reward title");
    setError(null);
    update.mutate(
      {
        id: program.id,
        patch: {
          type: f.type,
          title: f.title.trim(),
          description: program.description || f.title.trim(),
          required_count: num(f.required_count),
          reward_description: f.reward_description.trim(),
          minimum_spend: f.minimum_spend.trim() ? String(num(f.minimum_spend) ?? "") : null,
          expiry_days: num(f.expiry_days),
          max_redemptions_per_customer: num(f.max_redemptions_per_customer),
          max_banked: num(f.max_banked),
          terms: f.terms.trim(),
        },
      },
      {
        onSuccess: () => router.push("/business/rewards"),
        onError: (e: unknown) => setError((e as { message?: string })?.message ?? "Could not save"),
      },
    );
  }

  if (rewards.isLoading) {
    return (
      <OwnerShell title="Edit Loyalty Rules">
        <div className="text-subtle">Loading…</div>
      </OwnerShell>
    );
  }
  if (!program) {
    return (
      <OwnerShell title="Edit Loyalty Rules">
        <div className="max-w-md rounded-[18px] border border-line bg-card p-5">
          <p className="text-sm text-ink">No program selected.</p>
          <button onClick={() => router.push("/business/rewards")} className="mt-3 rounded-pill bg-brand px-5 py-2.5 text-sm font-bold text-brand-fg">
            Back to Loyalty
          </button>
        </div>
      </OwnerShell>
    );
  }

  return (
    <OwnerShell title="Edit Loyalty Rules">
      <div className="mx-auto max-w-[760px] animate-[jqIn_.3s_ease]">
        <div>
          <span className={LABEL}>Reward type</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {TYPES.map((t) => {
              const sel = f.type === t.v;
              return (
                <button
                  key={t.v}
                  onClick={() => setF((s) => ({ ...s, type: t.v }))}
                  className={`rounded-xl border-[1.5px] py-3 text-[13.5px] font-bold ${sel ? "border-brand bg-brand text-brand-fg" : "border-line bg-card text-ink"}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="mt-5 block">
          <span className={LABEL}>Reward title</span>
          <input value={f.title} onChange={set("title")} className={`${FIELD} mt-1.5`} />
        </label>

        <div className="mt-5 flex gap-3.5">
          <label className="flex-1">
            <span className={LABEL}>Required ({unit})</span>
            <input value={f.required_count} onChange={set("required_count")} inputMode="numeric" className={`${FIELD} mt-1.5`} />
          </label>
          <label className="flex-1">
            <span className={LABEL}>Reward value</span>
            <input value={f.reward_description} onChange={set("reward_description")} placeholder="1 free coffee" className={`${FIELD} mt-1.5`} />
          </label>
        </div>

        <div className="mt-5 flex gap-3.5">
          <label className="flex-1">
            <span className={LABEL}>Minimum purchase (som)</span>
            <input value={f.minimum_spend} onChange={set("minimum_spend")} placeholder="Any purchase" inputMode="numeric" className={`${FIELD} mt-1.5`} />
          </label>
          <label className="flex-1">
            <span className={LABEL}>Expiration period (days)</span>
            <input value={f.expiry_days} onChange={set("expiry_days")} placeholder="90" inputMode="numeric" className={`${FIELD} mt-1.5`} />
          </label>
        </div>

        <div className="mt-5 flex gap-3.5">
          <label className="flex-1">
            <span className={LABEL}>Max redemptions per customer</span>
            <input value={f.max_redemptions_per_customer} onChange={set("max_redemptions_per_customer")} placeholder="1" inputMode="numeric" className={`${FIELD} mt-1.5`} />
          </label>
          <label className="flex-1">
            <span className={LABEL}>Max gifts a customer can hold</span>
            <input value={f.max_banked} onChange={set("max_banked")} placeholder="Unlimited" inputMode="numeric" className={`${FIELD} mt-1.5`} />
          </label>
        </div>

        <label className="mt-5 block">
          <span className={LABEL}>Terms &amp; conditions</span>
          <textarea value={f.terms} onChange={set("terms")} rows={3} className={`${FIELD} mt-1.5 resize-none leading-relaxed`} />
        </label>

        {error && <p className="mt-4 text-sm font-semibold text-danger">{error}</p>}

        <div className="mt-6 flex gap-3.5">
          <button onClick={() => router.push("/business/rewards")} className="rounded-[14px] border-[1.5px] border-line bg-card px-7 py-3.5 text-[14.5px] font-semibold text-ink">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={update.isPending}
            className="flex-1 rounded-[14px] bg-brand py-3.5 text-[14.5px] font-bold text-brand-fg shadow-glow disabled:opacity-60"
          >
            {update.isPending ? "Saving…" : "Save Loyalty Program"}
          </button>
        </div>
      </div>
    </OwnerShell>
  );
}

export default function EditLoyaltyRulesPage() {
  return (
    <Suspense fallback={null}>
      <EditInner />
    </Suspense>
  );
}
