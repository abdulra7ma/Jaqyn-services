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
    business_card_accent: "",
    business_category: "",
    business_area: "",
    business_hours: {},
    type: "visit",
    name: "Program",
    reward_summary: "",
    reward_expiry_days: 30,
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

/** Open the loyalty detail sheet by clicking its wallet-card trigger. */
function openLoyaltySheet() {
  fireEvent.click(screen.getByRole("button", { name: "Manas Coffee" }));
}

describe("Business page — loyalty wallet card opens the detail sheet", () => {
  it("trigger is a wallet card; the sheet lists every program for a multi-type business", () => {
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

    // The trigger renders as a wallet card (a button labelled with the shop name).
    const trigger = screen.getByRole("button", { name: "Manas Coffee" });
    expect(trigger).toBeInTheDocument();
    openLoyaltySheet();

    // The wallet detail sheet lists both programs + the count + the QR action.
    // (Reward summaries also appear on the trigger card, hence getAllByText.)
    expect(screen.getAllByText("1 сом per point").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Free latte").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/cmp\.wallet\.programs/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("cmp.wallet.showMyQr")).toBeInTheDocument();
  });

  it("opens the sheet for a single-program business", () => {
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
    expect(screen.getAllByText("Free latte").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/cmp\.wallet\.detail\.oneProgram/)).toBeInTheDocument();
  });

  it("omits the loyalty section entirely when the business runs no programs", () => {
    loyalty.value = [];
    render(<BusinessProfilePage />);
    expect(screen.queryByRole("button", { name: "Manas Coffee" })).not.toBeInTheDocument();
  });
});
