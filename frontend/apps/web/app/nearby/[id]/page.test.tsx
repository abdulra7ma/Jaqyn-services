import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Business, BusinessLoyaltyProgram } from "@jaqyn/api";

// Mount the business page in isolation: stub the shell/params and mock the API at
// the module boundary (MSW-style boundary mocking via vi.mock, matching the other
// web tests). Asserts the multi-form-loyalty consolidated "Loyalty" card + switcher.

vi.mock("../../_components/CustomerShell", () => ({
  CustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "b-1" }) }));

function business(): Business {
  return {
    id: "b-1",
    name: "Manas Coffee",
    category: "cafe",
    description: null,
    address: "Chuy 1",
    area: "Center",
    latitude: null,
    longitude: null,
    phone: "+996700000000",
    public_email: null,
    website_url: null,
    instagram_url: null,
    logo_url: null,
    cover_url: null,
    glyph: "",
    accent_color: "#C25E3C",
    price_level: "",
    tags: [],
    working_hours: null,
    distance_km: null,
    reward: null,
    rewards: [],
    group_offers: [],
    catalog_sections: [],
    gallery: [],
  };
}

function program(over: Partial<BusinessLoyaltyProgram>): BusinessLoyaltyProgram {
  return {
    campaign_id: "c",
    name: "Program",
    mechanic: "visit",
    reward_summary: "",
    joined: false,
    progress_count: 0,
    target: 0,
    points_balance: 0,
    cashback_per_point: null,
    ...over,
  };
}

const loyalty: { value: BusinessLoyaltyProgram[] } = { value: [] };

vi.mock("@jaqyn/api", () => ({
  useBusiness: () => ({
    data: business(),
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useBusinessLoyalty: () => ({ data: loyalty.value, isLoading: false, isError: false }),
}));

import BusinessProfilePage from "./page";

describe("Business page — consolidated loyalty card (multi-form-loyalty)", () => {
  it("renders ONE card with a tab per program and switches bodies on tab click", () => {
    loyalty.value = [
      program({
        campaign_id: "pts",
        name: "Coffee Points",
        mechanic: "points",
        points_balance: 120,
        cashback_per_point: "1",
        joined: true,
        reward_summary: "1 сом per point",
      }),
      program({
        campaign_id: "vis",
        name: "Visit 5 times",
        mechanic: "visit",
        progress_count: 3,
        target: 5,
        joined: true,
        reward_summary: "Free latte",
      }),
    ];
    render(<BusinessProfilePage />);

    // Section heading + ONE card carrying the business name in its header (the
    // page <h1> also shows the name, so the loyalty card header is the 2nd match;
    // the test translator returns the i18n key verbatim, so we assert on keys).
    expect(screen.getByText("cmp.loyalty.title")).toBeInTheDocument();
    expect(screen.getAllByText("Manas Coffee")).toHaveLength(2);

    // Two programs → a tablist with one tab per program (labels from the mechanic).
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(screen.getByText("cmp.loyalty.tab.points")).toBeInTheDocument();
    expect(screen.getByText("cmp.loyalty.tab.visit")).toBeInTheDocument();

    // First tab is active → points body (reward summary + cashback "Use", balance>0).
    expect(screen.getByText("1 сом per point")).toBeInTheDocument();
    expect(screen.getByText("cmp.loyalty.use")).toBeInTheDocument();
    expect(screen.queryByText("Free latte")).not.toBeInTheDocument();

    // Switch to the visit tab → its body (reward summary + dot counts) now shows.
    fireEvent.click(screen.getByText("cmp.loyalty.tab.visit"));
    expect(screen.getByText("Free latte")).toBeInTheDocument();
    expect(screen.getByText("cmp.loyalty.visitsCount")).toBeInTheDocument();
    expect(screen.queryByText("1 сом per point")).not.toBeInTheDocument();
  });

  it("renders no switcher when the business runs a single program", () => {
    loyalty.value = [
      program({
        campaign_id: "vis",
        mechanic: "visit",
        target: 5,
        joined: true,
        reward_summary: "Free latte",
      }),
    ];
    render(<BusinessProfilePage />);
    expect(screen.getByText("Free latte")).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("omits the loyalty section entirely when the business runs no programs", () => {
    loyalty.value = [];
    render(<BusinessProfilePage />);
    expect(screen.queryByText("cmp.loyalty.title")).not.toBeInTheDocument();
  });
});
