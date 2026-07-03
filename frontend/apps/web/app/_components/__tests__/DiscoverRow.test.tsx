import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiscoverRow } from "../campaigns";
import type { Campaign } from "@jaqyn/api";

// vitest.setup.ts mocks @jaqyn/i18n → useT returns key identity,
// next/link → plain <a>, and matchMedia.

function makeCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "c1",
    business: {
      id: "b1",
      name: "Sierra Coffee",
      category: "cafe",
      logo_url: null,
      area: "Center",
      address: "ul. Chui 1",
    },
    business_lat: 42.87,
    business_lng: 74.59,
    glyph: "☕",
    name: "Coffee Challenge",
    description: "",
    blurb: "15% back as cashback",
    campaign_type: "individual",
    status: "active",
    start_label: "1 Jul",
    end_label: "31 Jul",
    days_left: 28,
    active_days: "",
    active_hours: "",
    active_start_time: "",
    active_end_time: "",
    repeat_policy: "once",
    max_participants: null,
    rule: {
      mechanic: "visit",
      required_count: 5,
      max_count_per_day: null,
      min_time_between: null,
      required_group_size: null,
      group_checkin_window: null,
      group_checkin_window_minutes: null,
    },
    reward: {
      type: "discount",
      title: "15% discount",
      description: "",
      expiry_days_after_unlock: 7,
      max_redemptions: null,
      item_selection: null,
      catalog_item: null,
    },
    my_progress: null,
    ...over,
  };
}

describe("DiscoverRow", () => {
  it("renders the business name", () => {
    render(<DiscoverRow campaign={makeCampaign()} userLoc={null} />);
    expect(screen.getByText("Sierra Coffee")).toBeInTheDocument();
  });

  it("renders the reward line (blurb)", () => {
    render(<DiscoverRow campaign={makeCampaign()} userLoc={null} />);
    // The reward line renders in the text content of its element.
    // Because the distance suffix is absent when userLoc is null, the element
    // text equals the blurb exactly.
    expect(screen.getByText("15% back as cashback")).toBeInTheDocument();
  });

  it("falls back to reward.title when blurb is empty", () => {
    render(
      <DiscoverRow campaign={makeCampaign({ blurb: "" })} userLoc={null} />,
    );
    expect(screen.getByText("15% discount")).toBeInTheDocument();
  });

  it("is a link to the campaign page", () => {
    render(<DiscoverRow campaign={makeCampaign()} userLoc={null} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/campaigns/c1");
  });

  it("links to the campaign detail page for group campaigns (same as individual)", () => {
    // DiscoverRow always links to /campaigns/{id} — same as CampaignCard.
    // The detail page routes the user into the group flow. /group is the
    // in-progress session view; sending an unjoined discover teaser there is wrong.
    render(
      <DiscoverRow
        campaign={makeCampaign({ campaign_type: "group" })}
        userLoc={null}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/campaigns/c1");
  });

  it("shows the join CTA key for an unjoined individual campaign", () => {
    render(<DiscoverRow campaign={makeCampaign()} userLoc={null} />);
    // vitest.setup mocks useT to return the key itself
    expect(screen.getByText("cmp.card.join")).toBeInTheDocument();
  });

  it("shows the view CTA key for a group campaign", () => {
    render(
      <DiscoverRow
        campaign={makeCampaign({ campaign_type: "group" })}
        userLoc={null}
      />,
    );
    expect(screen.getByText("cmp.card.view")).toBeInTheDocument();
  });

  it("shows the continue CTA when campaign is in progress", () => {
    render(
      <DiscoverRow
        campaign={makeCampaign({
          my_progress: {
            joined: true,
            status: "in_progress",
            current_count: 2,
            target_count: 5,
            completed: false,
            voucher_id: null,
          },
        })}
        userLoc={null}
      />,
    );
    expect(screen.getByText("cmp.card.continue")).toBeInTheDocument();
  });

  it("omits the distance suffix when userLoc is null", () => {
    render(<DiscoverRow campaign={makeCampaign()} userLoc={null} />);
    // The reward-line text should not contain " · " (no distance appended).
    const rewardEl = screen.getByText("15% back as cashback");
    expect(rewardEl.textContent).not.toContain("·");
  });

  it("omits the distance suffix when business has no geo", () => {
    render(
      <DiscoverRow
        campaign={makeCampaign({ business_lat: null, business_lng: null })}
        userLoc={{ lat: 42.87, lng: 74.59 }}
      />,
    );
    const rewardEl = screen.getByText("15% back as cashback");
    expect(rewardEl.textContent).not.toContain("·");
  });

  it("appends distance when both userLoc and business geo are present", () => {
    // userLoc and business at the same coordinates → 0 km → 0 m
    render(
      <DiscoverRow
        campaign={makeCampaign({ business_lat: 42.87, business_lng: 74.59 })}
        userLoc={{ lat: 42.87, lng: 74.59 }}
      />,
    );
    // The reward line element contains the blurb + " · " + distance.
    // useT returns the key for unit labels: "cmp.distance.m"
    const rewardEl = screen.getByText(/15% back as cashback · /);
    expect(rewardEl).toBeInTheDocument();
  });

  it("renders a visible distance suffix with non-zero separation", () => {
    // ~300 m apart in Bishkek center
    render(
      <DiscoverRow
        campaign={makeCampaign({ business_lat: 42.872, business_lng: 74.592 })}
        userLoc={{ lat: 42.870, lng: 74.590 }}
      />,
    );
    // Distance will be < 1 km → metres with "cmp.distance.m" key.
    const rewardEl = screen.getByText(/15% back as cashback · \d+ cmp\.distance\.m/);
    expect(rewardEl).toBeInTheDocument();
  });
});
