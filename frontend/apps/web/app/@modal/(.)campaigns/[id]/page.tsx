"use client";

import { useParams, useRouter } from "next/navigation";
import { CampaignDetailSheet } from "../../../campaigns/[id]/CampaignDetailRoute";

export default function InterceptedCampaignDetail() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  return <CampaignDetailSheet campaignId={id} onClose={() => router.back()} />;
}
