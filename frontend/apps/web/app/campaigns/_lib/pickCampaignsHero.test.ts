import { describe, expect, it } from "vitest";
import { pickCampaignsHero } from "./pickCampaignsHero";
import type { Campaign, LoyaltyCardView } from "@jaqyn/api";

// ---- Fixtures ----------------------------------------------------------------

function makeCard(over: Partial<LoyaltyCardView> = {}): LoyaltyCardView {
  return {
    program_id: "p1",
    business_id: "b1",
    business_name: "Manas Coffee",
    business_logo_url: null,
    business_card_accent: "",
    business_category: "cafe",
    business_area: "Centre",
    business_hours: {},
    business_lat: null,
    business_lng: null,
    type: "stamp",
    name: "Coffee card",
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
    ...over,
  };
}

function makeCampaign(over: Partial<Campaign> = {}): Campaign {
  const base: Campaign = {
    id: "c1",
    business: { id: "b1", name: "Manas", category: "cafe", logo_url: null, area: "", address: "" },
    business_lat: null,
    business_lng: null,
    glyph: "",
    name: "Coffee challenge",
    description: "",
    blurb: "",
    campaign_type: "individual",
    status: "active",
    start_label: "",
    end_label: "",
    days_left: 10,
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
      type: "free_item",
      title: "Free coffee",
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
    },
    instagram_handle: null,
    auto_join_link: null,
  };
  return { ...base, ...over };
}

function makeGroupCampaign(over: Partial<Campaign> = {}): Campaign {
  return makeCampaign({
    id: "g1",
    campaign_type: "group",
    rule: {
      mechanic: null,
      required_count: null,
      max_count_per_day: null,
      min_time_between: null,
      required_group_size: 4,
      group_checkin_window: "15 min",
      group_checkin_window_minutes: 15,
    },
    my_progress: {
      joined: true,
      status: "in_progress",
      current_count: 2,
      target_count: 4,
      completed: false,
      voucher_id: null,
    },
    ...over,
  });
}

// ---- Tests -------------------------------------------------------------------

describe("pickCampaignsHero", () => {
  it("returns empty when no cards or campaigns", () => {
    const result = pickCampaignsHero({ loyaltyCards: [], followed: [] });
    expect(result.kind).toBe("empty");
  });

  it("returns loyalty card for returning user with cards", () => {
    // 3/6 stamps → remaining=3, ratio=0.5
    const card = makeCard({ stamps_count: 3, required_count: 6 });
    const result = pickCampaignsHero({ loyaltyCards: [card], followed: [] });
    expect(result.kind).toBe("loyalty");
    if (result.kind === "loyalty") {
      expect(result.current).toBe(3);
      expect(result.total).toBe(6);
      expect(result.remaining).toBe(3);
      expect(result.ratio).toBeCloseTo(0.5);
    }
  });

  it("picks the card closest to completion (lowest ratio)", () => {
    // Card A: 1/6 remaining → ratio 1/6 ≈ 0.167 (closer)
    // Card B: 3/6 remaining → ratio 0.5
    const cardA = makeCard({ program_id: "pA", stamps_count: 5, required_count: 6 });
    const cardB = makeCard({ program_id: "pB", stamps_count: 3, required_count: 6 });
    const result = pickCampaignsHero({ loyaltyCards: [cardB, cardA], followed: [] });
    expect(result.kind).toBe("loyalty");
    if (result.kind === "loyalty") {
      expect(result.card.program_id).toBe("pA");
      expect(result.remaining).toBe(1);
    }
  });

  it("prefers loyalty over campaign on equal ratio", () => {
    // Card: 3/6 → ratio 0.5
    const card = makeCard({ stamps_count: 3, required_count: 6 });
    // Campaign: 2.5/5 = same ratio 0.5
    // Use 2/4 to match 0.5 exactly
    const campaign = makeCampaign({
      my_progress: { joined: true, status: "in_progress", current_count: 2, target_count: 4, completed: false, voucher_id: null },
      rule: { mechanic: "visit", required_count: 4, max_count_per_day: null, min_time_between: null, required_group_size: null, group_checkin_window: null, group_checkin_window_minutes: null },
    });
    const result = pickCampaignsHero({ loyaltyCards: [card], followed: [campaign] });
    expect(result.kind).toBe("loyalty");
  });

  it("picks campaign when it has lower ratio than loyalty card", () => {
    // Card: 3/6 → ratio 0.5
    const card = makeCard({ stamps_count: 3, required_count: 6 });
    // Campaign: 4/5 → remaining 1, ratio 0.2 (closer)
    const campaign = makeCampaign({
      my_progress: { joined: true, status: "in_progress", current_count: 4, target_count: 5, completed: false, voucher_id: null },
      rule: { mechanic: "visit", required_count: 5, max_count_per_day: null, min_time_between: null, required_group_size: null, group_checkin_window: null, group_checkin_window_minutes: null },
    });
    const result = pickCampaignsHero({ loyaltyCards: [card], followed: [campaign] });
    expect(result.kind).toBe("campaign");
    if (result.kind === "campaign") {
      expect(result.remaining).toBe(1);
    }
  });

  it("excludes cards/campaigns in claimableIds", () => {
    const card = makeCard({ program_id: "pA", stamps_count: 5, required_count: 6 });
    const claimableIds = new Set(["pA"]);
    const result = pickCampaignsHero({ loyaltyCards: [card], followed: [], claimableIds });
    // Only card excluded → empty.
    expect(result.kind).toBe("empty");
  });

  it("surfaces group campaign as group variant (highest priority after claimable exclusion)", () => {
    const group = makeGroupCampaign();
    // Also add a loyalty card — group should still win.
    const card = makeCard({ stamps_count: 5, required_count: 6 }); // very close
    const result = pickCampaignsHero({ loyaltyCards: [card], followed: [group] });
    expect(result.kind).toBe("group");
    if (result.kind === "group") {
      expect(result.joined).toBe(2);
      expect(result.required).toBe(4);
    }
  });

  it("skips group campaign if completed", () => {
    const group = makeGroupCampaign({
      my_progress: { joined: true, status: "completed", current_count: 4, target_count: 4, completed: true, voucher_id: "v1" },
    });
    const card = makeCard({ stamps_count: 3, required_count: 6 });
    const result = pickCampaignsHero({ loyaltyCards: [card], followed: [group] });
    // Group is completed so skipped; falls to loyalty card.
    expect(result.kind).toBe("loyalty");
  });

  it("early user: one card but stamps_count=0 → still returns loyalty", () => {
    const card = makeCard({ stamps_count: 0, required_count: 6 });
    const result = pickCampaignsHero({ loyaltyCards: [card], followed: [] });
    expect(result.kind).toBe("loyalty");
    if (result.kind === "loyalty") {
      expect(result.current).toBe(0);
      expect(result.remaining).toBe(6);
      expect(result.ratio).toBe(1);
    }
  });

  it("skips unjoined cards", () => {
    const card = makeCard({ joined: false, stamps_count: 5, required_count: 6 });
    const result = pickCampaignsHero({ loyaltyCards: [card], followed: [] });
    expect(result.kind).toBe("empty");
  });

  it("skips points-type cards (no discrete goal)", () => {
    const card = makeCard({ type: "points", points_balance: 100 });
    const result = pickCampaignsHero({ loyaltyCards: [card], followed: [] });
    expect(result.kind).toBe("empty");
  });
});
