/**
 * Home component tests — new-user state and basic rail rendering.
 * Tests call pickHero() directly and render individual components so they don't
 * need to mock the five data hooks.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CollectingList,
  carouselIndex,
  dedupeBusinesses,
  DiscoverRail,
  ExpiringStrip,
  ExploreHub,
  HeroCard,
  HomeHeroCarousel,
  WalletSummary,
  WalletPeekRail,
  NewCustomerHome,
} from "./home";

// vitest.setup.ts mocks @jaqyn/i18n → useT returns key identity.
// next/link → plain anchor.

describe("HeroCard — new-user variant", () => {
  it("shows start-earning copy and scan link", () => {
    render(<HeroCard hero={{ kind: "new-user" }} />);
    expect(screen.getByText("home.startEarning")).toBeInTheDocument();
    expect(screen.getByText("home.startEarningSub")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/scan");
  });
});

describe("NewCustomerHome", () => {
  it("greets a first-time user and gives an empty discovery state a nearby action", () => {
    render(<NewCustomerHome businesses={[]} name="Aida" />);

    expect(screen.getByText("home.heyName")).toBeInTheDocument();
    expect(screen.getByText("home.nearbyEmptyTitle")).toBeInTheDocument();
    expect(screen.getByText("home.nearbyEmptyBody")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "home.exploreNearby" })[0]).toHaveAttribute(
      "href",
      "/nearby",
    );
  });

  it("shows business names and an explore-more action when discovery has results", () => {
    render(
      <NewCustomerHome
        name="Aida"
        businesses={[
          {
            id: "b1",
            name: "Manas Coffee",
            category: "cafe",
            description: null,
            address: "Bishkek",
            area: "Center",
            phone: "",
            instagram_url: null,
            logo_url: null,
            cover_url: null,
            working_hours: {},
            distance_km: 1.4,
          },
        ]}
      />,
    );

    expect(screen.getByText("Manas Coffee")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "home.exploreNearby" })).toHaveAttribute(
      "href",
      "/nearby",
    );
  });
});

describe("ExploreHub", () => {
  it("uses the shared wallet icon for the wallet destination", () => {
    render(<ExploreHub />);
    const wallet = screen.getByRole("link", { name: "home.wallet" });
    expect(wallet.querySelector('[data-icon="wallet"]')).toBeInTheDocument();
  });
});

describe("HeroCard — voucher variant", () => {
  it("shows expiring soon pill and routes to campaign-wallet for campaign source", () => {
    render(
      <HeroCard
        hero={{
          kind: "voucher",
          source: "campaign",
          href: "/campaign-wallet",
          title: "Free coffee",
          business: "Cafe A",
          urgencyLabel: "3 Jul",
        }}
      />,
    );
    expect(screen.getByText(/home\.expiringSoon/)).toBeInTheDocument();
    expect(screen.getByText("Free coffee")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/campaign-wallet");
  });

  it("routes to /rewards for loyalty voucher", () => {
    render(
      <HeroCard
        hero={{
          kind: "voucher",
          source: "loyalty",
          href: "/rewards",
          title: "Free pastry",
          business: "Bakery B",
          urgencyLabel: "4 Jul",
        }}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/rewards");
  });
});

describe("HeroCard — progress variant", () => {
  it("shows reward title, business, stamp progress, and wallet link", () => {
    render(
      <HeroCard
        hero={{
          kind: "progress",
          source: "loyalty",
          href: "/loyalty/p1",
          title: "Free coffee",
          business: "Cafe C",
          remaining: 2,
          total: 6,
          current: 4,
          mechanic: "stamp",
          accentClass: "bg-wallet-terracotta",
        }}
      />,
    );
    expect(screen.getByText("Free coffee")).toBeInTheDocument();
    expect(screen.getByLabelText("4 / 6")).toBeInTheDocument();
    expect(screen.getByText("home.loyaltyCard")).toBeInTheDocument();
    expect(screen.getByText(/home\.viewCard/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Free coffee — Cafe C" })).toHaveAttribute(
      "href",
      "/loyalty/p1",
    );
  });
});

describe("HeroCard — cashback variant", () => {
  it("renders the ready balance treatment and wallet deep link", () => {
    render(
      <HeroCard
        hero={{
          kind: "cashback",
          source: "loyalty",
          href: "/loyalty?business=b1",
          business: "Bakery",
          businessId: "b1",
          amount: 180,
          progressPct: 100,
          rewardLabel: "5% cashback",
          ready: true,
          accentClass: "bg-wallet-amber",
        }}
      />,
    );
    expect(screen.getByText("180")).toBeInTheDocument();
    expect(screen.getByText("5% cashback")).toBeInTheDocument();
    expect(screen.queryByText("home.bonusProgress")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/loyalty?business=b1");
  });

  it("renders campaign cashback as a money card instead of stamp pips", () => {
    render(
      <HeroCard
        hero={{
          kind: "progress",
          source: "campaign",
          href: "/campaigns/cashback",
          title: "Cashback som",
          business: "Manas Coffee",
          remaining: 1,
          total: 1,
          current: 0,
          mechanic: "campaign",
          cashbackReward: true,
          accentClass: "bg-brand-gradient",
        }}
      />,
    );
    expect(screen.getByText("сом")).toBeInTheDocument();
    expect(screen.getByText("home.cashbackCampaign")).toBeInTheDocument();
    expect(screen.getByText(/home\.viewCashback/)).toBeInTheDocument();
    expect(screen.queryByLabelText("0 / 1")).not.toBeInTheDocument();
  });
});

describe("HeroCard — map variant", () => {
  it("shows real nearby business data and routes to the map", () => {
    render(
      <HeroCard
        hero={{
          kind: "map",
          businesses: [
            {
              id: "b1",
              name: "Manas Coffee",
              category: "cafe",
              description: null,
              address: "Bishkek",
              area: "Center",
              phone: "",
              instagram_url: null,
              logo_url: null,
              cover_url: null,
              working_hours: {},
              reward: "Free cappuccino",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Manas Coffee")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "home.exploreMap" })).toHaveAttribute(
      "href",
      "/nearby",
    );
  });
});

describe("HomeHeroCarousel", () => {
  it("uses a larger peeking rail without pager navigation", () => {
    render(
      <HomeHeroCarousel
        heroes={[{ kind: "new-user" }, { kind: "new-user" }, { kind: "new-user" }]}
      />,
    );
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("list").firstElementChild).toHaveClass("w-[300px]");
  });

  it("calculates the next snap position including the card gap", () => {
    expect(carouselIndex(320, 300, 3)).toBe(1);
    expect(carouselIndex(640, 300, 3)).toBe(2);
  });

  it("lets touch scroll the rail horizontally (touch-action pan-x, not pan-y)", () => {
    // Regression: touch-pan-y set touch-action:pan-y, which blocks horizontal
    // touch scrolling — the carousel wouldn't swipe on mobile. It must be pan-x.
    render(<HomeHeroCarousel heroes={[{ kind: "new-user" }, { kind: "new-user" }]} />);
    const rail = screen.getByRole("list");
    expect(rail.className).toContain("touch-pan-x");
    expect(rail.className).not.toContain("touch-pan-y");
  });

  it("appends a wallet tail card when more qualifying cards exist", () => {
    render(<HomeHeroCarousel heroes={[{ kind: "new-user" }]} collectingCount={8} />);
    const tail = screen.getByRole("link", { name: /home\.viewAllWallet/ });
    expect(tail).toHaveAttribute("href", "/loyalty");
    expect(screen.getByText("home.cardsCollecting")).toBeInTheDocument();
  });
});

describe("WalletPeekRail", () => {
  const baseCard = {
    program_id: "p1",
    business_id: "b1",
    business_name: "Cafe A",
    business_logo_url: null,
    business_card_accent: "",
    business_category: "cafe",
    business_area: "Center",
    business_hours: {},
    business_lat: null as null,
    business_lng: null as null,
    type: "stamp" as const,
    name: "Stamps",
    reward_summary: "Free coffee",
    reward_expiry_days: 30,
    joined: true,
    stamps_count: 3,
    visits_count: 0,
    required_count: 6,
    points_balance: 0,
    min_redeem_points: null,
    points_per_som: null,
    cashback_per_point: null,
    pct_back: null,
  };

  it("renders nothing when no joined cards", () => {
    const { container } = render(<WalletPeekRail cards={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a card link per business with name and balance line", () => {
    render(<WalletPeekRail cards={[baseCard]} />);
    expect(screen.getByText("Cafe A")).toBeInTheDocument();
    // stamps_count / required_count
    expect(screen.getByText("3/6")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    // wallet link + section all-link
    const walletLinks = links.filter((l) => l.getAttribute("href") === "/loyalty");
    expect(walletLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("excludes unjoined cards", () => {
    const { container } = render(<WalletPeekRail cards={[{ ...baseCard, joined: false }]} />);
    expect(container.firstChild).toBeNull();
  });

  it("excludes the program already featured in the hero", () => {
    const { container } = render(<CollectingList cards={[baseCard]} excludeProgramId="p1" />);
    expect(container.firstChild).toBeNull();
  });

  it("opens the matching business card through the wallet deep link", () => {
    render(<CollectingList cards={[baseCard]} />);
    const cardLink = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href") === "/loyalty?business=b1");
    expect(cardLink).toBeDefined();
    expect(screen.getByRole("img", { name: "3 / 6" })).toBeInTheDocument();
    expect(screen.getByText("3 / 6")).toBeInTheDocument();
  });

  it("uses business logos in the wallet summary and collecting list", () => {
    const card = { ...baseCard, business_logo_url: "/media/cafe-a.jpg" };
    render(
      <>
        <WalletSummary cards={[card]} readyVouchers={0} />
        <CollectingList cards={[card]} />
      </>,
    );
    expect(screen.getAllByAltText("Cafe A")).toHaveLength(1);
  });
});

describe("ExpiringStrip", () => {
  const baseVoucher = {
    id: "v1",
    code: "CODE",
    status: "active" as const,
    glyph: "🎁",
    business: { id: "b1", name: "Cafe" },
    campaign: { id: "c1", name: "Campaign" },
    reward_title: "Free coffee",
    reward_description: "",
    qr_token: "tok",
    issued_label: "1 Jul",
    expires_label: "3 Jul",
    expiring_soon: true,
    redeemed_at_label: null,
    redeemed_by: null,
    redeemed_branch: null,
    catalog_item: null,
    item_selection: null,
  };

  it("renders nothing when no expiring vouchers", () => {
    const { container } = render(
      <ExpiringStrip vouchers={[{ ...baseVoucher, expiring_soon: false }]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows expiring voucher with label and link", () => {
    render(<ExpiringStrip vouchers={[baseVoucher]} />);
    expect(screen.getByText("3 Jul")).toBeInTheDocument();
    expect(screen.getByText("Free coffee")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/campaign-wallet");
  });

  it("excludes voucher already shown in hero", () => {
    const { container } = render(
      <ExpiringStrip vouchers={[baseVoucher]} heroVoucherId="v1" />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("DiscoverRail", () => {
  const biz = { id: "b1", name: "Cafe X", category: "Cafe", area: "Center", logo_url: null };

  it("shows empty-state card when no businesses", () => {
    render(<DiscoverRail businesses={[]} />);
    // falls back to /nearby link
    const links = screen.getAllByRole("link");
    expect(links.some((l) => l.getAttribute("href") === "/nearby")).toBe(true);
  });

  it("renders business cards with correct links", () => {
    render(<DiscoverRail businesses={[biz]} />);
    expect(screen.getByText("Cafe X")).toBeInTheDocument();
    const link = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/nearby/b1");
    expect(link).toBeDefined();
  });
});

describe("dedupeBusinesses", () => {
  it("deduplicates by business id, preserves first-seen order", () => {
    const items = [
      { business: { id: "a", name: "A", category: "cafe", area: "Center", logo_url: null } },
      { business: { id: "b", name: "B", category: "cafe", area: "Center", logo_url: null } },
      { business: { id: "a", name: "A dup", category: "cafe", area: "Center", logo_url: null } },
    ];
    const result = dedupeBusinesses(items);
    expect(result.map((b) => b.id)).toEqual(["a", "b"]);
    expect(result[0]!.name).toBe("A"); // first-seen wins
  });
});
