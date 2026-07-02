"use client";

// Shared building blocks for the sectioned business-settings screen.
// Section components live beside this file; page.tsx wires them into the sub-nav.

import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useT } from "@jaqyn/i18n";

// Toast callback threaded from the page down into each section so a save in any
// section surfaces the same bottom-center toast.
export type Notify = (message: string) => void;

export const FIELD =
  "w-full rounded-xl border-[1.5px] border-line bg-card px-3 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand";
export const LABEL = "text-xs font-bold text-subtle";
export const CARD = "rounded-[18px] border border-line bg-card p-5";

// A titled settings card. Every section renders one so headings/spacing stay uniform.
export function SectionCard({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-[15px] font-bold text-ink">{title}</div>
          {hint ? <div className="mt-[3px] text-[12.5px] text-subtle">{hint}</div> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// Right-aligned per-section save button. Sections that persist through their own
// mutations (menu, gallery, uploads) don't render this.
export function SaveButton({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  const t = useT();
  return (
    <div className="mt-4 flex justify-end">
      <button
        onClick={onClick}
        disabled={pending}
        className="rounded-[14px] bg-brand px-7 py-3 text-[14px] font-bold text-brand-fg shadow-glow transition hover:brightness-105 disabled:opacity-60"
      >
        {pending ? t("owner.profile.saving") : t("owner.settings.save")}
      </button>
    </div>
  );
}

// Hydrate local form state once, the first time the source (business data) loads.
// After that the section owns its own state so edits aren't clobbered by refetches.
export function useHydratedForm<T>(source: unknown, build: () => T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(build);
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !source) return;
    setState(build());
    hydrated.current = true;
    // Hydrate-once from `source`; `build` is a fresh closure each render by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);
  return [state, setState];
}
