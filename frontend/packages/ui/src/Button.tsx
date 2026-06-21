import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-gradient text-brand-fg shadow-glow hover:brightness-105 active:brightness-95",
  secondary: "bg-board/60 text-ink hover:bg-board",
  ghost: "bg-transparent text-subtle hover:bg-board/50",
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-pill px-5 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
