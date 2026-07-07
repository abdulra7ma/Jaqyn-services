"use client";

import { ApiProvider } from "@jaqyn/api";
import { I18nProvider, useI18n } from "@jaqyn/i18n";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { useEffect, type ReactNode } from "react";

function GoogleProvider({ children }: { children: ReactNode }) {
  // Sync Google Identity Services UI language with the app locale. Without an
  // explicit locale, GSI falls back to the browser/geo language (e.g. Kyrgyz),
  // so the "Sign in with Google" button mismatches a Russian UI. See KAN-8.
  const { locale } = useI18n();
  return (
    <GoogleOAuthProvider
      clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""}
      locale={locale}
    >
      {children}
    </GoogleOAuthProvider>
  );
}

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
    <I18nProvider>
      <ApiProvider>
        <GoogleProvider>{children}</GoogleProvider>
      </ApiProvider>
    </I18nProvider>
  );
}
