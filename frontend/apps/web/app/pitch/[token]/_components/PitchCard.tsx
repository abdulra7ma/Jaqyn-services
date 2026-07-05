"use client";

import { useT } from "@jaqyn/i18n";
import { cn } from "@jaqyn/ui";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";
import { ACCENT_BG, cardAccent } from "../../../loyalty/_lib/wallet";

// ---- internal subcomponents ----

type StampCellProps = {
  index: number;
  total: number;
  filled: boolean;
  onTap: () => void;
};

function StampCell({ index, total, filled, onTap }: StampCellProps) {
  const t = useT();
  const isLast = index === total - 1;
  const stampAriaLabel = filled
    ? t("pitch.a11y.stampFilled").replace("{n}", String(index + 1))
    : t("pitch.a11y.stampEmpty").replace("{n}", String(index + 1));
  return (
    <motion.button
      type="button"
      aria-label={stampAriaLabel}
      aria-pressed={filled}
      onClick={onTap}
      className={cn(
        "flex aspect-square flex-1 items-center justify-center rounded-pill",
        "text-sm font-bold transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        isLast
          ? filled
            ? "bg-amber text-white shadow-inner"
            : "border-2 border-dashed border-white/40 text-white/50"
          : filled
            ? "bg-white/90 text-brand"
            : "border-2 border-dashed border-white/40 text-white/50",
      )}
      whileTap={{ scale: 0.9 }}
      animate={filled ? { scale: [1, 1.25, 1] } : { scale: 1 }}
      transition={{ duration: 0.25 }}
    >
      {isLast ? "★" : filled ? "✓" : index + 1}
    </motion.button>
  );
}

type RewardEditorProps = {
  goal: number;
  reward: string;
  onChange: (goal: number, reward: string) => void;
};

function RewardEditor({ goal, reward, onChange }: RewardEditorProps) {
  const t = useT();
  return (
    <div className="mt-3 rounded-xl bg-white/15 p-3 backdrop-blur-sm">
      <p className="mb-2.5 text-center text-[11px] font-bold uppercase tracking-widest text-white/70">
        {t("pitch.editor.save")}
      </p>
      {/* Stepper */}
      <div className="mb-2.5 flex items-center justify-center gap-3">
        <button
          type="button"
          aria-label={t("pitch.a11y.decreaseGoal")}
          disabled={goal <= 1}
          onClick={() => onChange(Math.max(1, goal - 1), reward)}
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/50 text-lg font-bold text-white disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          −
        </button>
        <span className="min-w-[2.5rem] text-center font-display text-2xl font-extrabold text-white">
          {goal}
        </span>
        <button
          type="button"
          aria-label={t("pitch.a11y.increaseGoal")}
          disabled={goal >= 20}
          onClick={() => onChange(Math.min(20, goal + 1), reward)}
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/50 text-lg font-bold text-white disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          +
        </button>
      </div>
      {/* Reward text */}
      <input
        type="text"
        aria-label={t("pitch.a11y.rewardLabel")}
        value={reward}
        onChange={(e) => onChange(goal, e.target.value)}
        maxLength={60}
        className="w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-center text-sm font-semibold text-white placeholder:text-white/40 focus:outline focus:outline-2 focus:outline-white"
        placeholder={t("pitch.editor.rewardPlaceholder")}
      />
    </div>
  );
}

// ---- PitchCard ----

export type PitchCardProps = {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
  goal: number;
  reward: string;
  onChange: (goal: number, reward: string) => void;
};

/**
 * Hero loyalty card for the pitch page. Tap stamps to fill (local state, framer-motion).
 * Reward pill opens inline editor. goal/reward are controlled from the parent page.
 */
export function PitchCard({ businessId, businessName, logoUrl, goal, reward, onChange }: PitchCardProps) {
  const t = useT();
  const accent = cardAccent(businessId);
  const gradientClass = ACCENT_BG[accent];

  const [filled, setFilled] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [burst, setBurst] = useState(false);

  const handleStampTap = (index: number) => {
    if (index < filled) return; // already filled; tapping again does nothing
    const next = index + 1;
    setFilled(next);
    if (next === goal) {
      setBurst(true);
      setTimeout(() => setBurst(false), 800);
    }
  };

  const filled_ = Math.min(filled, goal);
  const left = goal - filled_;

  const progressText = t("pitch.card.progress")
    .replace("{filled}", String(filled_))
    .replace("{total}", String(goal))
    .replace("{left}", String(left));

  const rewardLabel = t("pitch.card.rewardFree")
    .replace("{n}", String(goal))
    .replace("{reward}", reward);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-modal p-5 shadow-glow",
        gradientClass,
      )}
    >
      {/* decorative watermark bleed (design §8) */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10"
      />

      {/* header row */}
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={businessName}
              width={40}
              height={40}
              className="rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 font-display text-xl font-extrabold text-white">
              {businessName.trim().charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div>
            <p className="font-display text-base font-bold leading-tight text-white">
              {businessName}
            </p>
            <p className="text-[11px] text-white/70">{progressText}</p>
          </div>
        </div>
        {/* reward pill — tap to open editor */}
        <button
          type="button"
          onClick={() => setEditorOpen((o) => !o)}
          aria-expanded={editorOpen}
          aria-label={t("pitch.a11y.editReward")}
          className="shrink-0 rounded-pill border border-white/40 bg-white/20 px-3 py-1.5 text-[11px] font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          {rewardLabel}
        </button>
      </div>

      {/* stamp grid */}
      <div className="relative mt-4 flex items-center gap-2" aria-label={t("pitch.a11y.stampCard")}>
        {Array.from({ length: goal }).map((_, i) => (
          <StampCell
            key={i}
            index={i}
            total={goal}
            filled={i < filled_}
            onTap={() => handleStampTap(i)}
          />
        ))}
      </div>

      {/* burst animation overlay */}
      <AnimatePresence>
        {burst && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.4 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="text-5xl">🎉</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* inline reward editor (controlled, slides in below stamps) */}
      <AnimatePresence>
        {editorOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <RewardEditor goal={goal} reward={reward} onChange={onChange} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
