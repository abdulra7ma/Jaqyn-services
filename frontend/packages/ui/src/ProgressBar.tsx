import { cn } from "./cn";

export function ProgressBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-pill bg-board", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
    >
      <div className="h-full rounded-pill bg-brand-gradient transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
