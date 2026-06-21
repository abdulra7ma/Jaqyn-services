import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "brand" | "ok" | "danger" | "warn";

const TONES: Record<Tone, string> = {
  neutral: "bg-board/60 text-subtle",
  brand: "bg-brand-muted text-brand-deep",
  ok: "bg-sage-soft text-ok",
  danger: "bg-brand-muted text-danger",
  warn: "bg-amber/15 text-amber-deep",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
