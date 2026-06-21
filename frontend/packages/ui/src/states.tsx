import type { ReactNode } from "react";
import { Button } from "./Button";

// Every screen must render loading / empty / error states (TBD §22).

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-subtle">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {label}
    </div>
  );
}

export function Empty({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-subtle">
      {icon}
      <p>{message}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = "Retry",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-danger">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
