"use client";

import { useT } from "@jaqyn/i18n";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { CampaignRouteSheet } from "./CampaignRouteSheet";
import { CustomerShell } from "./CustomerShell";
import { SegmentError, SegmentLoading } from "./segment";

function SheetState({ children }: { children: ReactNode }) {
  const t = useT();
  const router = useRouter();
  const close = () => {
    if (window.history.length > 1) router.back();
    else router.push("/campaigns");
  };

  return (
    <CustomerShell title={t("campaigns.title")} hideChromeTitle>
      <CampaignRouteSheet title={t("campaigns.title")} onClose={close}>
        {children}
      </CampaignRouteSheet>
    </CustomerShell>
  );
}

export function CampaignSheetLoading() {
  return (
    <SheetState>
      <SegmentLoading />
    </SheetState>
  );
}

export function CampaignSheetError({ reset }: { reset: () => void }) {
  return (
    <SheetState>
      <SegmentError reset={reset} />
    </SheetState>
  );
}
