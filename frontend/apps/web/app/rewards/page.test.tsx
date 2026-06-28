import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Campaign, CampaignWallet } from "@jaqyn/api";

// Rewards "In progress" row consolidates the feed's `followed` into ONE
// BusinessLoyaltyCard per business, with a switcher per program
// (multi-form-loyalty). The earned-voucher sections render below, unchanged.

vi.mock("../_components/CustomerShell", () => ({
  CustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../_lib/auth", () => ({ useRequireAuth: () => ({ isAuthenticated: true }) }));
// QueryBoundary → call its render prop with the wallet data directly.
vi.mock("../_components/QueryBoundary", () => ({
  QueryBoundary: ({
    query,
    children,
  }: {
    query: { data: CampaignWallet };
    children: (data: CampaignWallet) => React.ReactNode;
  }) => <>{children(query.data)}</>,
}));

function campaign(over: Partial<Campaign>): Campaign {
  return {
    id: "c",
    business: { id: "b", name: "Manas", category: "cafe", logo_url: null, area: "", address: "" },
    glyph: "",
    name: "Campaign",
    description: "",
    blurb: "",
    campaign_type: "individual",
    status: "active",
    start_label: "",
    end_label: "",
    days_left: 5,
    active_days: "",
    active_hours: "",
    active_start_time: "",
    active_end_time: "",
    repeat_policy: "once",
    max_participants: null,
    rule: {
      mechanic: "visit",
      required_count: 5,
      required_spend: null,
      max_count_per_day: null,
      min_time_between: null,
      required_group_size: null,
      group_checkin_window: null,
      min_spend: null,
      group_checkin_window_minutes: null,
      points_basis: null,
      points_per_visit: null,
      points_per_som: null,
      cashback_per_point: null,
    },
    reward: {
      type: "free_item",
      title: "Free latte",
      description: "",
      expiry_days_after_unlock: 7,
      max_redemptions: null,
      item_selection: null,
      catalog_item: null,
    },
    my_progress: {
      joined: true,
      status: "in_progress",
      current_count: 2,
      target_count: 5,
      completed: false,
      voucher_id: null,
      points_balance: 0,
    },
    instagram_handle: null,
    auto_join_link: null,
    ...over,
  };
}

const emptyWallet: CampaignWallet = { active: [], used: [], expired: [] };
const feed: { followed: Campaign[] } = { followed: [] };

vi.mock("@jaqyn/api", () => ({
  useCampaignWallet: () => ({ data: emptyWallet, isLoading: false, isError: false }),
  useCampaignFeed: () => ({ data: { followed: feed.followed, discover: [] }, isLoading: false }),
}));

import RewardsPage from "./page";

describe("Rewards — consolidated in-progress loyalty cards", () => {
  it("renders ONE card per business with a tab per program, switching bodies", () => {
    // Two programs at the same business + one at another → 2 cards total.
    feed.followed = [
      campaign({
        id: "manas-visit",
        name: "Visit 5 times",
        business: { id: "b-manas", name: "Manas Coffee", category: "cafe", logo_url: null, area: "", address: "" },
        rule: { ...campaign({}).rule, mechanic: "visit" },
      }),
      campaign({
        id: "manas-points",
        name: "Coffee Points",
        business: { id: "b-manas", name: "Manas Coffee", category: "cafe", logo_url: null, area: "", address: "" },
        rule: { ...campaign({}).rule, mechanic: "points", cashback_per_point: "1" },
        my_progress: { ...campaign({}).my_progress!, points_balance: 80 },
      }),
      campaign({
        id: "rams-spend",
        name: "Spend 5000",
        business: { id: "b-rams", name: "Rams Bakery", category: "bakery", logo_url: null, area: "", address: "" },
        rule: { ...campaign({}).rule, mechanic: "spend" },
      }),
    ];
    render(<RewardsPage />);

    expect(screen.getByText("cmp.wallet.inProgress")).toBeInTheDocument();
    // Two business cards.
    expect(screen.getByText("Manas Coffee")).toBeInTheDocument();
    expect(screen.getByText("Rams Bakery")).toBeInTheDocument();

    // Manas has two programs → a switcher (visit + points tabs); first is active.
    expect(screen.getByText("cmp.loyalty.tab.visit")).toBeInTheDocument();
    expect(screen.getByText("cmp.loyalty.tab.points")).toBeInTheDocument();
    expect(screen.getByText("Visit 5 times")).toBeInTheDocument();
    expect(screen.queryByText("Coffee Points")).not.toBeInTheDocument();

    // Switch to the points tab → its body (balance pill) shows.
    fireEvent.click(screen.getByText("cmp.loyalty.tab.points"));
    expect(screen.getByText("Coffee Points")).toBeInTheDocument();
    expect(screen.getByText("cmp.loyalty.points")).toBeInTheDocument();

    // Rams runs a single program → no tabs for it (only Manas' two tabs exist).
    expect(screen.getByText("Spend 5000")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });
});
