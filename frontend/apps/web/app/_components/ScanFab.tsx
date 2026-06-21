"use client";

import { useT } from "@jaqyn/i18n";
import Link from "next/link";
import { ScanIcon } from "./icons";

/** Floating scan button — anchored bottom-right of the centered column, above the nav. */
export function ScanFab() {
  const t = useT();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-20 mx-auto max-w-md px-4 lg:hidden">
      <div className="flex justify-end">
        <Link
          href="/qr"
          aria-label={t("qr.myQrTitle")}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-brand-fg shadow-glow active:scale-95"
        >
          <ScanIcon className="h-7 w-7" />
        </Link>
      </div>
    </div>
  );
}
