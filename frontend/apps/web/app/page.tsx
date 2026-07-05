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
import Link from "next/link";
import { CustomerShell } from "./_components/CustomerShell";
import { GuestLanding } from "./_components/GuestLanding";
import {
  CollectingList,
  CampaignNoticeBanner,
  CampaignDiscoveryCard,
  HomeHeroCarousel,
  HeroSkeleton,
  NewCustomerHome,
  NearbyDiscoveryCard,
  WalletSummary,
} from "./_components/home";
import { pickHomeHeroes } from "./_lib/pickHero";
import { useAuth } from "./_lib/auth";
import { PinIcon } from "./_components/icons";

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
    limit: 20,
  });

  const isLoading =
    wallet.isLoading || feed.isLoading || loyaltyCards.isLoading || loyaltyVouchers.isLoading;
  const isOffline =
    !isLoading && (wallet.isError || feed.isError || loyaltyCards.isError || loyaltyVouchers.isError);

  const campaignVouchers = wallet.data?.active ?? [];
  const loyaltyVoucherList = loyaltyVouchers.data?.active ?? [];
  const cards = loyaltyCards.data ?? [];
  const followed = feed.data?.followed ?? [];
  const pickedHeroes = pickHomeHeroes({
    campaignVouchers,
    loyaltyVouchers: loyaltyVoucherList,
    loyaltyCards: cards,
    followed,
    featuredCampaignIds: homeSummary.data?.featured_campaign_ids ?? [],
    nearbyBusinesses: nearby.data ?? [],
    promoteMap: location != null && (nearby.data?.length ?? 0) > 10,
  });
  const logoByBusinessName = new Map<string, string>();
  for (const card of cards) {
    if (card.business_logo_url) logoByBusinessName.set(card.business_name, card.business_logo_url);
  }
  for (const business of nearby.data ?? []) {
    if (business.logo_url) logoByBusinessName.set(business.name, business.logo_url);
  }
  const heroes = pickedHeroes.map((hero) =>
    hero.kind === "progress" && !hero.businessLogoUrl
      ? { ...hero, businessLogoUrl: logoByBusinessName.get(hero.business) ?? null }
      : hero,
  );
  const collectingCount =
    cards.filter((card) => card.joined && card.required_count != null).length +
    followed.filter((campaign) => campaign.my_progress?.target_count != null).length;
  const firstHero = heroes[0];
  const heroProgramId =
    firstHero?.kind === "progress" && firstHero.source === "loyalty"
      ? cards.find((card) => card.business_id === firstHero.businessId && card.type === "stamp")?.program_id
      : undefined;
  const isNewCustomer =
    !isLoading &&
    cards.length === 0 &&
    followed.length === 0 &&
    campaignVouchers.length === 0 &&
    loyaltyVoucherList.length === 0;
  const joinedBusinessIds = new Set(cards.filter((card) => card.joined).map((card) => card.business_id));
  const discoveryBusiness = nearby.data?.find(
    (business) => Boolean(business.reward) && !joinedBusinessIds.has(business.id),
  );
  const discoveryCampaign = feed.data?.discover.find((campaign) => !campaign.my_progress?.joined);

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
  if (isNewCustomer) {
    return nearby.isLoading ? (
      <HeroSkeleton />
    ) : (
      <NewCustomerHome businesses={nearby.data ?? []} name={name} />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate font-display text-2xl font-bold tracking-tight text-ink">
          {t("home.heyName").replace("{name}", name)}
        </h1>
        <Link href="/nearby" aria-label={t("nav.nearby")} className="inline-flex min-h-11 flex-none items-center gap-2 rounded-pill border border-line bg-card px-3.5 text-sm font-bold text-ink shadow-card">
          <PinIcon className="h-4 w-4 text-brand" />
          {t("nav.nearby")}
        </Link>
      </div>

      {isOffline && cards.length > 0 && (
        <p className="rounded-xl border border-line bg-card px-4 py-3 text-xs font-semibold text-subtle shadow-card">
          {t("home.offlineSaved")}
        </p>
      )}

      {isLoading ? <HeroSkeleton /> : <HomeHeroCarousel heroes={heroes} collectingCount={collectingCount} />}
      {!isLoading && <WalletSummary cards={cards} readyVouchers={campaignVouchers.length + loyaltyVoucherList.length} />}
      {isLoading ? (
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-ink">{t("home.keepCollecting")}</h2>
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-xl bg-tile" />
            <div className="h-24 animate-pulse rounded-xl bg-tile" />
          </div>
        </section>
      ) : (
        <CollectingList cards={cards} excludeProgramId={heroProgramId} />
      )}
      {campaignNotices.data?.[0] && (
        <CampaignNoticeBanner
          notice={campaignNotices.data[0]}
          onSeen={(id) => markCampaignNoticesSeen.mutate([id])}
        />
      )}
      {!campaignNotices.data?.[0] && discoveryCampaign && (
        <CampaignDiscoveryCard campaign={discoveryCampaign} />
      )}
      {!campaignNotices.data?.[0] && !discoveryCampaign && discoveryBusiness && (
        <NearbyDiscoveryCard business={discoveryBusiness} />
      )}
    </div>
  );
}
