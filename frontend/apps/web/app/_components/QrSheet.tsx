"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth } from "../_lib/auth";
import { MyQrSheet } from "./MyQrSheet";

/**
 * Lets any customer screen open the personal-QR sheet as an overlay on the
 * CURRENT page (so the page stays visible behind the transparent sheet) instead
 * of navigating to the standalone `/qr` route. The provider lives in
 * `CustomerShell`, so every trigger inside the shell (bottom-nav scan button,
 * home/profile buttons) can open it without a route change. The `/qr` route is
 * kept as a deep-link fallback.
 */
const QrSheetContext = createContext<{ openQr: () => void }>({
  openQr: () => {},
});

export function useQrSheet(): { openQr: () => void } {
  return useContext(QrSheetContext);
}

export function QrSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  return (
    <QrSheetContext.Provider value={{ openQr: () => setOpen(true) }}>
      {children}
      {open && isAuthenticated && (
        <MyQrSheet
          isAuthenticated={isAuthenticated}
          onClose={() => setOpen(false)}
        />
      )}
    </QrSheetContext.Provider>
  );
}

/**
 * Button that opens the personal-QR sheet over the current page. Used where a
 * page previously linked to `/qr` (home, profile). Renders inside the shell's
 * `children`, so the `useQrSheet` hook resolves to the provider.
 */
export function MyQrButton({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { openQr } = useQrSheet();
  return (
    <button type="button" onClick={openQr} className={className}>
      {children}
    </button>
  );
}
