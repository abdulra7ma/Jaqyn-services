"use client";

/**
 * Legacy route: /rewards/:id (progress id).
 *
 * The banking-rewards redesign replaced the per-progress detail page with a
 * per-business card at /rewards/business/:businessId.  This shim resolves the
 * progress record and redirects there so any bookmarked or linked URLs still
 * work.
 */

import { useRewards } from "@jaqyn/api";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { CustomerShell } from "../../_components/CustomerShell";
import { useRequireAuth } from "../../_lib/auth";
import { useT } from "@jaqyn/i18n";

export default function RewardLegacyRedirectPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useRequireAuth();
  const rewards = useRewards();
  const router = useRouter();

  useEffect(() => {
    if (!rewards.data) return;
    const progress = rewards.data.find((p) => p.id === id);
    if (progress) {
      // Redirect to the new per-business card
      router.replace(`/rewards/business/${progress.business.id}`);
    } else {
      // Unknown id — fall back to wallet
      router.replace("/rewards");
    }
  }, [rewards.data, id, router]);

  return (
    <CustomerShell title={t("rewards.title")} back="/rewards" showNav={false}>
      {!isAuthenticated ? null : (
        <p className="text-center text-sm text-subtle">{t("common.loading")}</p>
      )}
    </CustomerShell>
  );
}
