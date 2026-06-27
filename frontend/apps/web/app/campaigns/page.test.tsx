import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign, CampaignFeed, CampaignFeedFilter } from "@jaqyn/api";

vi.mock("../_components/CustomerShell", () => ({
  CustomerShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../_lib/auth", () => ({ useRequireAuth: () => ({ isAuthenticated: true }) }));

const lastFilter: { value: CampaignFeedFilter | undefined } = { value: undefined };

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
    },
    reward: { type: "free_item", title: "Free", description: "Free coffee", expiry_days_after_unlock: 7, max_redemptions: null },
    my_progress: null,
    instagram_handle: null,
    auto_join_link: null,
    ...over,
  };
}

vi.mock("@jaqyn/api", () => ({
  useCampaignFeed: (filter?: CampaignFeedFilter) => {
    lastFilter.value = filter;
    const feed: CampaignFeed = {
      followed: [campaign({ id: "f-1", name: "In Progress Coffee" })],
      discover: [campaign({ id: "d-1", name: "Discover Bakery", campaign_type: "group" })],
    };
    return { data: feed, isLoading: false, isError: false };
  },
  // No active group by default → the feed banner stays hidden.
  useMyGroups: () => ({ data: [], isLoading: false, isError: false }),
}));

import CampaignsFeedPage from "./page";

describe("Customer campaigns feed — sections + chips", () => {
  beforeEach(() => {
    lastFilter.value = undefined;
  });

  it('renders the "From places you go" row and the "Discover more" list', () => {
    render(<CampaignsFeedPage />);
    expect(screen.getByText("cmp.feed.followed")).toBeInTheDocument();
    expect(screen.getByText("In Progress Coffee")).toBeInTheDocument();
    expect(screen.getByText("cmp.feed.discover")).toBeInTheDocument();
    expect(screen.getByText("Discover Bakery")).toBeInTheDocument();
  });

  it("renders the four discover chips (All/Group/Neighborhood/Ended)", () => {
    render(<CampaignsFeedPage />);
    for (const key of [
      "cmp.feed.chip.all",
      "cmp.feed.chip.group",
      "cmp.feed.chip.neighborhood",
      "cmp.feed.chip.ended",
    ]) {
      expect(screen.getByRole("tab", { name: key })).toBeInTheDocument();
    }
  });

  it("selecting a chip drives the feed filter and marks it selected", async () => {
    const user = userEvent.setup();
    render(<CampaignsFeedPage />);
    const ended = screen.getByRole("tab", { name: "cmp.feed.chip.ended" });
    await user.click(ended);
    expect(lastFilter.value).toBe("ended");
    expect(ended).toHaveAttribute("aria-selected", "true");
  });
});
