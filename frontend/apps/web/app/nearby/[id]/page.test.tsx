import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Business, LoyaltyCardView } from "@jaqyn/api";

// BusinessProfilePage is now a thin wrapper over BusinessSheet which contains
// BusinessDetailsContent. We mock BusinessSheet to render the content directly
// so the test stays focused on loyalty-card behavior without fighting the sheet/router.

vi.mock("../../_components/BusinessSheet", async () => {
  const actual = await import("../../_components/BusinessDetailsContent");
  return {
    BusinessSheet: ({ businessId }: { businessId: string }) => (
      <actual.BusinessDetailsContent businessId={businessId} />
    ),
  };
});
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "b-1" }),
  useRouter: () => ({ back: vi.fn() }),
}));
vi.mock("../../_lib/auth", () => ({
  useRequireAuth: () => ({ isAuthenticated: true }),
}));

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

function program(over: Partial<LoyaltyCardView>): LoyaltyCardView {
  return {
    program_id: "c",
    business_id: "b-1",
    business_name: "Manas Coffee",
    business_logo_url: null,
    type: "visit",
    name: "Program",
    reward_summary: "",
    joined: false,
    stamps_count: 0,
    visits_count: 0,
    required_count: 0,
    points_balance: 0,
    points_per_som: null,
    cashback_per_point: null,
    pct_back: null,
    ...over,
  };
}

const loyalty: { value: LoyaltyCardView[] } = { value: [] };

vi.mock("@jaqyn/api", () => ({
  useBusiness: () => ({
    data: business(),
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useBusinessLoyalty: () => ({ data: loyalty.value, isLoading: false, isError: false }),
  useJoinLoyalty: () => ({ mutate: vi.fn(), isPending: false }),
}));

import BusinessProfilePage from "./page";

/** Open the loyalty bottom-sheet by clicking its trigger row. */
function openLoyaltySheet() {
  // The trigger <p> reads "cmp.loyalty.title · N common.programs" — use substring match.
  const trigger = screen.getByText("cmp.loyalty.title", { exact: false }).closest("button")!;
  fireEvent.click(trigger);
}

describe("Business page — consolidated loyalty card (multi-form-loyalty)", () => {
  it("renders ONE card with a tab per program and switches bodies on tab click", () => {
    loyalty.value = [
      program({
        program_id: "pts",
        name: "Coffee Points",
        type: "points",
        points_balance: 120,
        cashback_per_point: "1",
        joined: true,
        reward_summary: "1 сом per point",
      }),
      program({
        program_id: "vis",
        name: "Visit 5 times",
        type: "visit",
        visits_count: 3,
        required_count: 5,
        joined: true,
        reward_summary: "Free latte",
      }),
    ];
    render(<BusinessProfilePage />);

    // Trigger row is visible; open the loyalty sheet to see the card content.
    expect(screen.getAllByText("cmp.loyalty.title", { exact: false }).length).toBeGreaterThanOrEqual(1);
    openLoyaltySheet();

    // Sheet header shows business name alongside trigger row — at least 2 occurrences.
    expect(screen.getAllByText("Manas Coffee").length).toBeGreaterThanOrEqual(2);

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
        program_id: "vis",
        type: "visit",
        required_count: 5,
        joined: true,
        reward_summary: "Free latte",
      }),
    ];
    render(<BusinessProfilePage />);
    openLoyaltySheet();
    expect(screen.getByText("Free latte")).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("omits the loyalty section entirely when the business runs no programs", () => {
    loyalty.value = [];
    render(<BusinessProfilePage />);
    expect(screen.queryByText("cmp.loyalty.title")).not.toBeInTheDocument();
  });
});
