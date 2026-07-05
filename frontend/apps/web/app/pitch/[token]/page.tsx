"use client";

import { usePitchResolve } from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { Button, Loading } from "@jaqyn/ui";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ClaimSheet } from "./_components/ClaimSheet";
import { FeatureBlocks } from "./_components/FeatureBlocks";
import { PitchCard } from "./_components/PitchCard";

// ---- dead-link screen ----

function DeadLink() {
  const t = useT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-5 py-12">
      <div className="w-full max-w-sm rounded-xl border border-dashed border-line bg-card p-8 text-center shadow-card">
        {/* icon tile */}
        <div
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-tile text-3xl"
        >
          🔗
        </div>
        <h1 className="mt-4 font-display text-xl font-bold text-ink">
          {t("pitch.dead.title")}
        </h1>
        <p className="mt-2 text-sm text-subtle">{t("pitch.dead.sub")}</p>
        <a
          href="https://t.me/jaqyn"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand px-6 py-3.5 text-[15px] font-bold text-white shadow-glow hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          {t("pitch.dead.telegram")}
        </a>
      </div>
    </div>
  );
}

// ---- pitch content (only rendered once data is available) ----

type PitchContentProps = {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
  defaultGoal: number;
  defaultReward: string;
  publishedCount: number;
  token: string;
};

function PitchContent({
  businessId,
  businessName,
  logoUrl,
  defaultGoal,
  defaultReward,
  publishedCount,
  token,
}: PitchContentProps) {
  const t = useT();
  const [goal, setGoal] = useState(defaultGoal);
  const [rewardText, setRewardText] = useState(defaultReward);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleChange = (g: number, r: string) => {
    setGoal(g);
    setRewardText(r);
  };

  const heroTitle = t("pitch.hero.title").replace("{name}", businessName);
  const socialLine =
    publishedCount > 0
      ? `${publishedCount} · ${t("pitch.social")}`
      : t("pitch.social");

  return (
    <div className="relative min-h-screen bg-cream pb-28">
      {/* page body */}
      <div className="mx-auto max-w-md px-5 pt-8">
        {/* hero copy */}
        <h1 className="font-display text-2xl font-extrabold leading-tight text-ink">
          {heroTitle}
        </h1>
        <p className="mt-2 text-[14.5px] text-subtle">{t("pitch.hero.sub")}</p>

        {/* hero card */}
        <div className="mt-5">
          <PitchCard
            businessId={businessId}
            businessName={businessName}
            logoUrl={logoUrl}
            goal={goal}
            reward={rewardText}
            onChange={handleChange}
          />
        </div>

        {/* tap hint */}
        <p className="mt-3 text-center text-xs text-subtle">{t("pitch.hero.tapHint")}</p>

        {/* feature blocks */}
        <div className="mt-8">
          <FeatureBlocks
            businessName={businessName}
            goal={goal}
            reward={rewardText}
          />
        </div>

        {/* social proof */}
        <p className="mt-6 text-center text-sm font-semibold text-subtle">{socialLine}</p>
      </div>

      {/* sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 z-10 flex flex-col items-center gap-1 border-t border-line bg-card/90 px-5 py-4 backdrop-blur-sm">
        <Button
          className="w-full max-w-md"
          onClick={() => setSheetOpen(true)}
        >
          {t("pitch.cta")}
        </Button>
        <p className="text-xs text-subtle">{t("pitch.cta.sub")}</p>
      </div>

      {/* claim sheet */}
      <ClaimSheet
        token={token}
        businessName={businessName}
        goal={goal}
        rewardText={rewardText}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

// ---- page ----

export default function PitchPage() {
  const { token } = useParams<{ token: string }>();
  const resolve = usePitchResolve(token);

  const t = useT();
  if (resolve.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <Loading label={t("common.loading")} />
      </div>
    );
  }

  // Any resolve error (404/410/expired/claimed) → dead-link screen (design §W4)
  if (resolve.isError || !resolve.data) {
    return <DeadLink />;
  }

  const d = resolve.data;
  return (
    <PitchContent
      businessId={d.business_id}
      businessName={d.business_name}
      logoUrl={d.logo_url}
      defaultGoal={d.default_goal}
      defaultReward={d.default_reward}
      publishedCount={d.published_count}
      token={token}
    />
  );
}
