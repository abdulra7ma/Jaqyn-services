"use client";

import { useParams, useRouter } from "next/navigation";
import { GroupRouteSheet } from "../../../../campaigns/[id]/group/GroupRoute";

export default function InterceptedGroupCampaign() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  return <GroupRouteSheet campaignId={id} onClose={() => router.back()} />;
}
