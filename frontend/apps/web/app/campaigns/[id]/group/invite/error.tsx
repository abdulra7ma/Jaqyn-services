"use client";

import { CampaignSheetError } from "../../../../_components/CampaignRouteState";

export default function GroupInviteError({ reset }: { error: Error; reset: () => void }) {
  return <CampaignSheetError reset={reset} />;
}
