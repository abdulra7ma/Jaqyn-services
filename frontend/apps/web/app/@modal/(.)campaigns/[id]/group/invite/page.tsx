"use client";

import { useParams, useRouter } from "next/navigation";
import { GroupInviteRouteSheet } from "../../../../../campaigns/[id]/group/invite/InviteRoute";

export default function InterceptedGroupInvite() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  return <GroupInviteRouteSheet campaignId={id} onClose={() => router.back()} />;
}
