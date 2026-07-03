"use client";

import {
  useCampaignFeed,
  useCampaignNotices,
  useCampaignWallet,
  useLoyaltyCards,
  useLoyaltyHomeSummary,
  useLoyaltyVouchers,
  useMe,
  useMarkCampaignNoticesSeen,
  useNearby,
} from "@jaqyn/api";
import { useT } from "@jaqyn/i18n";
import { useEffect, useState } from "react";
import { CustomerShell } from "./_components/CustomerShell";
import { GuestLanding } from "./_components/GuestLanding";
import {
  CollectingList,
  CampaignNoticeBanner,
  ExploreHub,
  HomeHeroCarousel,
  HeroSkeleton,
  NewCustomerHome,
  StreakChip,
  WalletSummary,
} from "./_components/home";
import { pickHomeHeroes } from "./_lib/pickHero";
import { useAuth } from "./_lib/auth";

export default function HomePage() {
  const t = useT();
  const { isAuthenticated, ready } = useAuth();

  if (!ready) return null;
  // Signed-out visitors get the full responsive discovery landing (no bottom nav).
  if (!isAuthenticated) return <GuestLanding />;
  // Signed-in customers get the app shell (bottom nav is mobile-only).
  return (
    <CustomerShell title={t("app.customer")} hideChromeTitle>
      <AuthedHome />
    </CustomerShell>
  );
}

function AuthedHome() {
  const t = useT();
  const me = useMe();
  const wallet = useCampaignWallet();
  const feed = useCampaignFeed();
  const loyaltyCards = useLoyaltyCards();
  const loyaltyVouchers = useLoyaltyVouchers();
  const homeSummary = useLoyaltyHomeSummary();
  const campaignNotices = useCampaignNotices();
  const markCampaignNoticesSeen = useMarkCampaignNoticesSeen();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const nearby = useNearby({
    lat: location?.lat,
    lng: location?.lng,
    radius_km: location ? 2 : undefined,
    limit: 20,
  });

  const isLoading =
    wallet.isLoading || feed.isLoading || loyaltyCards.isLoading || loyaltyVouchers.isLoading;

  const campaignVouchers = wallet.data?.active ?? [];
  const loyaltyVoucherList = loyaltyVouchers.data?.active ?? [];
  const cards = loyaltyCards.data ?? [];
  const followed = feed.data?.followed ?? [];
  const heroes = pickHomeHeroes({
    campaignVouchers,
    loyaltyVouchers: loyaltyVoucherList,
    loyaltyCards: cards,
    followed,
    featuredCampaignIds: homeSummary.data?.featured_campaign_ids ?? [],
    nearbyBusinesses: nearby.data ?? [],
    promoteMap: location != null && (nearby.data?.length ?? 0) > 10,
  });
  const firstHero = heroes[0];
  const heroProgramId =
    firstHero?.kind === "progress" && firstHero.source === "loyalty"
      ? cards.find((card) => card.business_id === firstHero.businessId && card.type === "stamp")?.program_id
      : undefined;
  const isNewCustomer = !isLoading && heroes.length === 1 && heroes[0]?.kind === "new-user";

  useEffect(() => {
    if (!navigator.geolocation) return;
    // Session-scoped cache asks once per app session, then reuses the validated
    // coordinates when the customer returns home from another route.
    const cachedLocation = sessionStorage.getItem("jaqyn-customer-location");
    if (cachedLocation) {
      try {
        const parsed: unknown = JSON.parse(cachedLocation);
        if (
          parsed &&
          typeof parsed === "object" &&
          "lat" in parsed &&
          "lng" in parsed &&
          typeof parsed.lat === "number" &&
          typeof parsed.lng === "number"
        ) {
          setLocation({ lat: parsed.lat, lng: parsed.lng });
          return;
        }
      } catch {
        sessionStorage.removeItem("jaqyn-customer-location");
      }
    }
    if (sessionStorage.getItem("jaqyn-location-requested") === "true") return;
    sessionStorage.setItem("jaqyn-location-requested", "true");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        sessionStorage.setItem(
          "jaqyn-customer-location",
          JSON.stringify(nextLocation),
        );
        setLocation(nextLocation);
      },
      () => setLocation(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const name = me.data?.user.name?.split(" ")[0] || t("home.friend");
  const hour = new Date().getHours();
  const dayPart = hour < 12 ? "home.morning" : hour < 18 ? "home.afternoon" : "home.evening";

  if (isNewCustomer) {
    return nearby.isLoading ? <HeroSkeleton /> : <NewCustomerHome businesses={nearby.data ?? []} userLocation={location} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-subtle">{t(dayPart)}</p>
          <p className="truncate font-display text-2xl font-bold tracking-tight text-ink">
            {t("home.heyName").replace("{name}", name)}
          </p>
        </div>
        {(homeSummary.data?.visit_streak_days ?? 0) > 0 && (
          <StreakChip
            days={homeSummary.data?.visit_streak_days ?? 0}
            activeToday={homeSummary.data?.streak_active_today ?? false}
            relatedHero={firstHero}
          />
        )}
      </div>

      {campaignNotices.data?.[0] && (
        <CampaignNoticeBanner
          notice={campaignNotices.data[0]}
          onSeen={(id) => markCampaignNoticesSeen.mutate([id])}
        />
      )}

      {isLoading ? <HeroSkeleton /> : <HomeHeroCarousel heroes={heroes} />}
      <ExploreHub />
      <WalletSummary cards={cards} readyVouchers={campaignVouchers.length + loyaltyVoucherList.length} />
      <CollectingList cards={cards} excludeProgramId={heroProgramId} />
    </div>
  );
}
