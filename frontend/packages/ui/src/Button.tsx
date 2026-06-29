import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-gradient text-brand-fg shadow-glow hover:brightness-105 active:brightness-95",
  secondary: "bg-board/60 text-ink hover:bg-board",
  ghost: "bg-transparent text-subtle hover:bg-board/50",
  // design-system §4 Danger: #B0563A text, 1px #E4B8AC border, white surface.
  danger: "bg-card text-[#B0563A] border border-[#E4B8AC] hover:bg-[#FBF1ED]",
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
