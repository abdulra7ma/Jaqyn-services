"use client";

import { CampaignSheetError } from "../../../_components/CampaignRouteState";

export default function GroupSessionError({ reset }: { error: Error; reset: () => void }) {
  return <CampaignSheetError reset={reset} />;
}
