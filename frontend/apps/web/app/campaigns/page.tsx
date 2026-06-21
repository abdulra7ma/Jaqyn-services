"use client";

import { useT } from "@jaqyn/i18n";
import { Empty } from "@jaqyn/ui";
import { CustomerShell } from "../_components/CustomerShell";

// Campaigns (neighborhood missions) are a later backend phase — empty for now.
export default function CampaignsPage() {
  const t = useT();
  return (
    <CustomerShell title={t("campaigns.title")}>
      <p className="-mt-1 mb-2 text-sm text-subtle">{t("campaigns.subtitle")}</p>
      <Empty message={t("campaigns.empty")} icon={<span className="text-3xl">🎟️</span>} />
    </CustomerShell>
  );
}
