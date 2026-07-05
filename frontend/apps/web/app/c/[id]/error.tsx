"use client";

import { CampaignSheetError } from "../../_components/CampaignRouteState";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <CampaignSheetError reset={reset} />;
}
