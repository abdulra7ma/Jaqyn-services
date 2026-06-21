"use client";

// Campaigns (OwnerShell design, responsive). Neighborhood campaigns a business can
// join are admin-curated; there's no business-facing campaigns endpoint yet, so this
// shows the on-brand empty state until one lands.

import { OwnerShell } from "../_components/OwnerShell";
import { useAuth } from "../../_lib/auth";

const CARD = "rounded-[18px] border border-line bg-card p-5";

export default function BusinessCampaignsPage() {
  const { isAuthenticated, ready } = useAuth();

  return (
    <OwnerShell title="Campaigns">
      {!ready ? null : !isAuthenticated ? (
        <div className={`${CARD} max-w-md`}>
          <p className="text-sm text-subtle">Sign in to see neighborhood campaigns.</p>
        </div>
      ) : (
        <div className="mx-auto max-w-[760px] animate-[jqIn_.3s_ease]">
          <div className="flex items-start gap-[11px] rounded-[14px] bg-[#FBF3E6] px-4 py-3.5">
            <span className="text-[17px]">◇</span>
            <div className="text-[12.5px] leading-relaxed text-[#8A6A3A]">
              Campaigns are neighborhood missions across Bishkek that drive customers to participating businesses.
            </div>
          </div>
          <div className={`${CARD} mt-3.5 text-center`}>
            <div className="text-3xl">📣</div>
            <div className="mt-3 font-display text-lg font-bold text-ink">No campaigns available yet</div>
            <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-subtle">
              The Jaqyn team curates neighborhood campaigns. When one opens for your category, you’ll be able to join it and
              add your required offer here.
            </p>
          </div>
        </div>
      )}
    </OwnerShell>
  );
}
