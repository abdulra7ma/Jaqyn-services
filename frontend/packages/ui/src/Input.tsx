import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input({ label, id, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          "min-h-11 rounded-xl border border-line bg-card px-3 text-base text-ink outline-none focus:border-brand",
          className,
        )}
        {...props}
      />
    </div>
  );
}
