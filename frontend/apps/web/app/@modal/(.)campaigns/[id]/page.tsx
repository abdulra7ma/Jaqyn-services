"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { CampaignDetailSheet } from "../../../campaigns/[id]/CampaignDetailRoute";

// Campaign ids are UUIDs (backend: campaigns/<uuid:campaign_id>/). The @modal
// slot has no static siblings, so on client navigation Next also intercepts
// the static /campaigns/* pages (patches, discover, visit-qr) into this [id]
// route — the sheet would then fetch a campaign named "patches" and 404.
// A non-UUID segment therefore means "static sibling page": skip the sheet
// and escape interception with a full navigation so the server resolves the
// real route.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function InterceptedCampaignDetail() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const isCampaignId = UUID_RE.test(id);

  useEffect(() => {
    if (!isCampaignId) window.location.replace(`/campaigns/${id}`);
  }, [isCampaignId, id]);

  if (!isCampaignId) return null;
  return <CampaignDetailSheet campaignId={id} onClose={() => router.back()} />;
}
