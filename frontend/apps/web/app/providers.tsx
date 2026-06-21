"use client";

import { ApiProvider } from "@jaqyn/api";
import { I18nProvider } from "@jaqyn/i18n";
import { useEffect, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <ApiProvider>
      <I18nProvider>{children}</I18nProvider>
    </ApiProvider>
  );
}
