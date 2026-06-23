"use client";

import { SegmentError } from "../_components/segment";

export default function CampaignWalletError({ reset }: { error: Error; reset: () => void }) {
  return <SegmentError reset={reset} />;
}
