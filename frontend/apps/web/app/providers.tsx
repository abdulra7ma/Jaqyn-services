"use client";

import { ApiProvider } from "@jaqyn/api";
import { I18nProvider } from "@jaqyn/i18n";
import { useEffect, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Service worker disabled: its offline-shell caching caused stale 301s and
    // re-fetch noise in production. Actively unregister any SW already installed
    // on a visitor's device and purge its caches so they get fresh responses.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
    }
  }, []);

  return (
    <ApiProvider>
      <I18nProvider>{children}</I18nProvider>
    </ApiProvider>
  );
}
