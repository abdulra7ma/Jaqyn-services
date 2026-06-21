"use client";

// Loyalty program (OwnerShell design, responsive), wired to /api/business/rewards/.
// Active program card with live enrolled/redeemed stats; Edit rules → editor,
// Pause/Resume → toggle; templates create a program in one click.

import { useBusinessRewards, useCreateReward, useToggleReward, type RewardProgramFull } from "@jaqyn/api";
import { useRouter } from "next/navigation";
import { OwnerShell } from "../_components/OwnerShell";
import { useAuth } from "../../_lib/auth";

const CARD = "rounded-[18px] border border-line bg-card p-5";

const TYPE_LABEL: Record<string, string> = {
  stamp: "Stamp card",
  visit: "Visit-based",
  spend: "Spend-based",
  coupon: "Discount coupon",
  welcome: "Welcome",
  birthday: "Birthday",
};
const REQUIRED_UNIT: Record<string, string> = { stamp: "stamps", visit: "visits", spend: "som", coupon: "uses" };

const TEMPLATES = [
  { glyph: "🎟️", title: "Visit 5 times, free dessert", sub: "Visit-based", type: "visit", required: 5, reward: "Free dessert" },
  { glyph: "💸", title: "Spend 1,000, get 100 off", sub: "Spend-based", type: "spend", required: 1000, reward: "100 c off" },
  { glyph: "🎂", title: "Birthday reward", sub: "One-time", type: "birthday", required: 1, reward: "Birthday treat" },
];

export default function BusinessLoyaltyPage() {
  const { isAuthenticated, ready } = useAuth();
  const router = useRouter();
  const rewards = useBusinessRewards();
  const create = useCreateReward();
  const toggle = useToggleReward();

  const active = rewards.data?.find((r: RewardProgramFull) => r.is_active) ?? rewards.data?.[0];

  function applyTemplate(tpl: (typeof TEMPLATES)[number]) {
    create.mutate({ type: tpl.type, title: tpl.title, description: tpl.sub, required_count: tpl.required, reward_description: tpl.reward });
  }

  return (
    <OwnerShell title="Loyalty Program">
      {!ready ? null : !isAuthenticated ? (
        <SignIn />
      ) : (
        <div className="mx-auto flex max-w-[760px] animate-[jqIn_.3s_ease] flex-col gap-7">
          {active ? (
            <div className="rounded-[20px] border border-line bg-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="rounded-pill bg-[#FBEFD9] px-2.5 py-1 text-[11.5px] font-bold text-amber-deep">
                    {TYPE_LABEL[active.type] ?? active.type}
                  </span>
                  <div className="mt-3.5 font-display text-2xl font-bold leading-tight text-ink">{active.title}</div>
                  <div className="mt-1.5 text-[13.5px] text-subtle">
                    {active.is_active ? "Active" : "Paused"} · {active.enrolled ?? 0} customers enrolled
                  </div>
                </div>
                <span
                  className={`inline-flex flex-none items-center gap-[7px] rounded-pill px-3 py-1.5 text-xs font-bold ${
                    active.is_active ? "bg-sage-soft text-ok" : "bg-board/60 text-subtle"
                  }`}
                >
                  <span className={`h-[7px] w-[7px] rounded-full ${active.is_active ? "bg-sage-deep" : "bg-subtle"}`} />
                  {active.is_active ? "Active" : "Paused"}
                </span>
              </div>
              <div className="mt-[22px] grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-3">
                <Stat
                  label="Required"
                  value={active.required_count != null ? `${active.required_count} ${REQUIRED_UNIT[active.type] ?? ""}`.trim() : "—"}
                />
                <Stat label="Reward value" value={active.reward_description || "—"} />
                <Stat label="Redeemed" value={`${active.redeemed_count ?? 0} times`} />
              </div>
              <div className="mt-[22px] flex gap-3">
                <button
                  onClick={() => router.push(`/business/rewards/edit?id=${active.id}`)}
                  className="flex-1 rounded-[13px] bg-brand py-3.5 text-[14.5px] font-bold text-brand-fg shadow-glow"
                >
                  Edit rules
                </button>
                <button
                  onClick={() => toggle.mutate({ id: active.id, active: !active.is_active })}
                  disabled={toggle.isPending}
                  className="flex-1 rounded-[13px] border-[1.5px] border-line bg-card py-3.5 text-[14.5px] font-semibold text-ink disabled:opacity-60"
                >
                  {active.is_active ? "Pause program" : "Resume program"}
                </button>
              </div>
            </div>
          ) : rewards.isLoading ? (
            <div className={`${CARD} text-subtle`}>Loading loyalty program…</div>
          ) : (
            <div className={CARD}>
              <div className="font-display text-lg font-bold text-ink">No active loyalty program yet</div>
              <p className="mt-1.5 text-[13.5px] text-subtle">Pick a template below to launch your first reward in seconds.</p>
            </div>
          )}

          <div>
            <div className="font-display text-base font-bold text-ink">Start from a template</div>
            <div className="mt-1 text-[13px] text-subtle">Reward templates tuned for your category — no blank forms.</div>
            <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.title}
                  onClick={() => applyTemplate(tpl)}
                  disabled={create.isPending}
                  className="rounded-2xl border border-line bg-card p-[18px] text-left transition hover:border-brand disabled:opacity-60"
                >
                  <div className="text-[22px]">{tpl.glyph}</div>
                  <div className="mt-2.5 text-[14.5px] font-bold text-ink">{tpl.title}</div>
                  <div className="mt-1.5 text-[12.5px] text-subtle">{tpl.sub}</div>
                </button>
              ))}
            </div>
            {create.isError && <p className="mt-3 text-sm text-danger">Could not create program — try again.</p>}
          </div>
        </div>
      )}
    </OwnerShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4">
      <div className="text-xs text-subtle">{label}</div>
      <div className="mt-1.5 font-display text-[19px] font-bold text-ink">{value}</div>
    </div>
  );
}

function SignIn() {
  return (
    <div className={`${CARD} max-w-md`}>
      <p className="text-sm text-subtle">Sign in to manage your loyalty program.</p>
    </div>
  );
}
