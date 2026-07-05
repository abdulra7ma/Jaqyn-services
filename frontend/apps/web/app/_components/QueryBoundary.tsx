"use client";

import { useT } from "@jaqyn/i18n";
import { Empty, ErrorState, Loading } from "@jaqyn/ui";
import type { ReactNode } from "react";
import { useErrMessage } from "../_lib/useErrMessage";

type QueryLike<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

/** Renders loading/error/empty/success for a TanStack query result. */
export function QueryBoundary<T>({
  query,
  isEmpty,
  emptyMessage,
  emptyAction,
  children,
}: {
  query: QueryLike<T>;
  isEmpty?: (data: T) => boolean;
  emptyMessage?: string;
  /** Empty states must offer a next step — pass the obvious action when one exists. */
  emptyAction?: { label: string; onClick: () => void };
  children: (data: T) => ReactNode;
}) {
  const t = useT();
  const errMessage = useErrMessage();

  if (query.isLoading) return <Loading label={t("common.loading")} />;
  if (query.isError) {
    return (
      <ErrorState
        message={errMessage(query.error)}
        onRetry={() => query.refetch()}
        retryLabel={t("common.retry")}
      />
    );
  }
  if (query.data === undefined) return <Loading label={t("common.loading")} />;
  if (isEmpty?.(query.data)) {
    return (
      <Empty
        message={emptyMessage ?? t("common.empty")}
        actionLabel={emptyAction?.label}
        onAction={emptyAction?.onClick}
      />
    );
  }
  return <>{children(query.data)}</>;
}
