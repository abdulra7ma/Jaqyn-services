/**
 * Home component tests — new-user state and basic rail rendering.
 * Tests call pickHero() directly and render individual components so they don't
 * need to mock the five data hooks.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  dedupeBusinesses,
  DiscoverRail,
  ExpiringStrip,
  HeroCard,
  WalletPeekRail,
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
  it("shows reward title, business, and steps-left copy", () => {
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
          accentClass: "bg-wallet-terracotta",
        }}
      />,
    );
    expect(screen.getByText("Free coffee")).toBeInTheDocument();
    expect(screen.getByText("Cafe C")).toBeInTheDocument();
    // stepsLeft key is returned as identity by the mock, then .replace("{count}", "2")
    expect(screen.getByText("home.stepsLeft".replace("{count}", "2"))).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/loyalty/p1");
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
    type: "stamp" as const,
    name: "Stamps",
    reward_summary: "Free coffee",
    reward_expiry_days: 30,
    joined: true,
    stamps_count: 3,
    visits_count: 0,
    required_count: 6,
    points_balance: 0,
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
