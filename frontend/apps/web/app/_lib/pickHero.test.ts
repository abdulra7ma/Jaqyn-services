import type { Business, Campaign, CampaignVoucher, LoyaltyCardView, LoyaltyVoucher } from "@jaqyn/api";
import { describe, expect, it } from "vitest";
import { pickHero, pickHomeHeroes } from "./pickHero";

// --- minimal fixture builders ---

function campaignVoucher(over: Partial<CampaignVoucher> = {}): CampaignVoucher {
  return {
    id: "cv1",
    code: "CODE",
    status: "active",
    glyph: "🎁",
    business: { id: "b1", name: "Cafe A" },
    campaign: { id: "c1", name: "Stamp Campaign" },
    reward_title: "Free coffee",
    reward_description: "",
    qr_token: "tok",
    issued_label: "1 Jul",
    expires_label: "3 Jul",
    expiring_soon: false,
    redeemed_at_label: null,
    redeemed_by: null,
    redeemed_branch: null,
    catalog_item: null,
    item_selection: null,
    ...over,
  };
}

function loyaltyVoucher(over: Partial<LoyaltyVoucher> = {}): LoyaltyVoucher {
  return {
    id: "lv1",
    program: "p1",
    program_name: "Stamps",
    business: "b1",
    business_name: "Cafe B",
    voucher_code: "V1",
    status: "active",
    reward_type: "free_item",
    reward_title: "Free pastry",
    cashback_amount: null,
    catalog_item: null,
    catalog_item_name: null,
    qr_token: null,
    issued_at: "2026-07-01T10:00:00Z",
    expires_at: null,
    redeemed_at: null,
    ...over,
  };
}

function loyaltyCard(over: Partial<LoyaltyCardView> = {}): LoyaltyCardView {
  return {
    program_id: "p1",
    business_id: "b1",
    business_name: "Cafe C",
    business_logo_url: null,
    business_card_accent: "",
    business_category: "cafe",
    business_area: "Center",
    business_hours: {},
    business_lat: null,
    business_lng: null,
    type: "stamp",
    name: "Stamps",
    reward_summary: "Free coffee",
    reward_expiry_days: 30,
    joined: true,
    stamps_count: 4,
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

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "c1",
    business: { id: "b1", name: "Cafe D", category: "cafe", logo_url: null, area: "Center", address: "" },
    business_lat: null,
    business_lng: null,
    glyph: "🎯",
    name: "Visit Challenge",
    description: "",
    blurb: "",
    campaign_type: "individual",
    status: "active",
    start_label: "1 Jul",
    end_label: "31 Jul",
    days_left: 28,
    active_days: "Mon–Sun",
    active_hours: "09:00–21:00",
    active_start_time: "09:00",
    active_end_time: "21:00",
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
      title: "Free meal",
      type: "free_item",
      description: "",
      expiry_days_after_unlock: 30,
      max_redemptions: null,
      item_selection: null,
    } as Campaign["reward"],
    my_progress: { joined: true, status: "in_progress", current_count: 3, target_count: 5, completed: false, voucher_id: null },
    ...over,
  };
}

const NOW = new Date("2026-07-03T12:00:00Z");
const empty = { campaignVouchers: [], loyaltyVouchers: [], loyaltyCards: [], followed: [] };

function nearbyBusiness(index: number): Business {
  return {
    id: `b${index}`,
    name: `Cafe ${index}`,
    category: "cafe",
    description: null,
    address: "Bishkek",
    area: "Center",
    phone: "",
    instagram_url: null,
    logo_url: null,
    cover_url: null,
    working_hours: {},
    distance_km: index / 10,
    reward: "Free coffee",
  };
}

describe("pickHero — priority 1: expiring voucher", () => {
  it("campaign voucher with expiring_soon beats everything", () => {
    const result = pickHero(
      {
        campaignVouchers: [campaignVoucher({ expiring_soon: true })],
        loyaltyVouchers: [],
        loyaltyCards: [loyaltyCard({ stamps_count: 5, required_count: 6 })],
        followed: [],
      },
      NOW,
    );
    expect(result.kind).toBe("voucher");
    if (result.kind === "voucher") {
      expect(result.source).toBe("campaign");
      expect(result.href).toBe("/campaign-wallet");
    }
  });

  it("loyalty voucher expiring within 3 days shows as urgency", () => {
    // expires_at 2 days from NOW → within 3-day window
    const expiresAt = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = pickHero(
      {
        campaignVouchers: [],
        loyaltyVouchers: [loyaltyVoucher({ expires_at: expiresAt })],
        loyaltyCards: [],
        followed: [],
      },
      NOW,
    );
    expect(result.kind).toBe("voucher");
    if (result.kind === "voucher") {
      expect(result.source).toBe("loyalty");
      expect(result.href).toBe("/rewards");
    }
  });

  it("loyalty voucher expiring in 4 days does NOT trigger urgency", () => {
    const expiresAt = new Date(NOW.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString();
    const result = pickHero(
      {
        campaignVouchers: [],
        loyaltyVouchers: [loyaltyVoucher({ expires_at: expiresAt })],
        loyaltyCards: [],
        followed: [],
      },
      NOW,
    );
    // Should fall through to new-user (no loyalty cards or followed campaigns)
    expect(result.kind).toBe("new-user");
  });

  it("loyalty voucher with no expires_at is not urgent", () => {
    const result = pickHero(
      { campaignVouchers: [], loyaltyVouchers: [loyaltyVoucher({ expires_at: null })], loyaltyCards: [], followed: [] },
      NOW,
    );
    expect(result.kind).toBe("new-user");
  });

  it("campaign urgency beats loyalty urgency (campaign voucher checked first)", () => {
    const expiresAt = new Date(NOW.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();
    const result = pickHero(
      {
        campaignVouchers: [campaignVoucher({ expiring_soon: true, reward_title: "Campaign reward" })],
        loyaltyVouchers: [loyaltyVoucher({ expires_at: expiresAt, reward_title: "Loyalty reward" })],
        loyaltyCards: [],
        followed: [],
      },
      NOW,
    );
    expect(result.kind).toBe("voucher");
    if (result.kind === "voucher") {
      expect(result.source).toBe("campaign");
      expect(result.title).toBe("Campaign reward");
    }
  });
});

describe("pickHero — priority 2: closest to reward", () => {
  it("picks the loyalty card with fewest steps remaining", () => {
    const result = pickHero(
      {
        campaignVouchers: [],
        loyaltyVouchers: [],
        loyaltyCards: [
          loyaltyCard({ program_id: "p1", stamps_count: 4, required_count: 6 }), // 2 remaining
          loyaltyCard({ program_id: "p2", stamps_count: 5, required_count: 6 }), // 1 remaining
        ],
        followed: [],
      },
      NOW,
    );
    expect(result.kind).toBe("progress");
    if (result.kind === "progress") {
      expect(result.remaining).toBe(1);
      expect(result.href).toBe("/loyalty?business=b1");
    }
  });

  it("points cards are excluded (no required_count goal)", () => {
    const result = pickHero(
      {
        campaignVouchers: [],
        loyaltyVouchers: [],
        loyaltyCards: [loyaltyCard({ type: "points", required_count: null, points_balance: 999 })],
        followed: [],
      },
      NOW,
    );
    expect(result.kind).toBe("new-user");
  });

  it("card already at goal (remaining = 0) is excluded", () => {
    const result = pickHero(
      {
        campaignVouchers: [],
        loyaltyVouchers: [],
        loyaltyCards: [loyaltyCard({ stamps_count: 6, required_count: 6 })], // 0 remaining
        followed: [],
      },
      NOW,
    );
    expect(result.kind).toBe("new-user");
  });

  it("joined campaign wins a tie over standing loyalty", () => {
    const result = pickHero(
      {
        campaignVouchers: [],
        loyaltyVouchers: [],
        loyaltyCards: [loyaltyCard({ stamps_count: 4, required_count: 5 })], // 1 remaining
        followed: [campaign({ my_progress: { joined: true, status: "in_progress", current_count: 4, target_count: 5, completed: false, voucher_id: null } })], // also 1 remaining
      },
      NOW,
    );
    expect(result.kind).toBe("progress");
    if (result.kind === "progress") {
      expect(result.source).toBe("campaign");
    }
  });

  it("joined campaign is featured before standing loyalty", () => {
    const result = pickHero(
      {
        campaignVouchers: [],
        loyaltyVouchers: [],
        loyaltyCards: [loyaltyCard({ stamps_count: 1, required_count: 6 })], // 5 remaining
        followed: [campaign({ my_progress: { joined: true, status: "in_progress", current_count: 4, target_count: 5, completed: false, voucher_id: null } })], // 1 remaining
      },
      NOW,
    );
    expect(result.kind).toBe("progress");
    if (result.kind === "progress") {
      expect(result.source).toBe("campaign");
      expect(result.remaining).toBe(1);
    }
  });

  it("unjoined cards are excluded", () => {
    const result = pickHero(
      {
        campaignVouchers: [],
        loyaltyVouchers: [],
        loyaltyCards: [loyaltyCard({ joined: false, stamps_count: 5, required_count: 6 })],
        followed: [],
      },
      NOW,
    );
    expect(result.kind).toBe("new-user");
  });

  it("campaigns with null target_count are excluded", () => {
    const result = pickHero(
      {
        campaignVouchers: [],
        loyaltyVouchers: [],
        loyaltyCards: [],
        followed: [campaign({ my_progress: { joined: true, status: "in_progress", current_count: 3, target_count: null, completed: false, voucher_id: null } })],
      },
      NOW,
    );
    expect(result.kind).toBe("new-user");
  });

  it("campaign with no progress (my_progress null) is excluded", () => {
    const result = pickHero(
      {
        campaignVouchers: [],
        loyaltyVouchers: [],
        loyaltyCards: [],
        followed: [campaign({ my_progress: null })],
      },
      NOW,
    );
    expect(result.kind).toBe("new-user");
  });

  it("visit card uses visits_count", () => {
    const result = pickHero(
      {
        campaignVouchers: [],
        loyaltyVouchers: [],
        loyaltyCards: [loyaltyCard({ type: "visit", visits_count: 2, stamps_count: 0, required_count: 4 })],
        followed: [],
      },
      NOW,
    );
    expect(result.kind).toBe("progress");
    if (result.kind === "progress") {
      expect(result.remaining).toBe(2);
      expect(result.current).toBe(2);
    }
  });
});

describe("pickHero — priority 3: new user", () => {
  it("returns new-user when all inputs empty", () => {
    expect(pickHero(empty, NOW)).toEqual({ kind: "new-user" });
  });

  it("non-expiring campaign voucher with no progress → new-user", () => {
    const result = pickHero(
      { campaignVouchers: [campaignVoucher({ expiring_soon: false })], loyaltyVouchers: [], loyaltyCards: [], followed: [] },
      NOW,
    );
    expect(result.kind).toBe("new-user");
  });
});

describe("pickHomeHeroes", () => {
  it("returns three ranked rewards followed by map discovery", () => {
    const heroes = pickHomeHeroes(
      {
        campaignVouchers: [campaignVoucher({ expiring_soon: true })],
        loyaltyVouchers: [],
        loyaltyCards: [
          loyaltyCard({ program_id: "near", stamps_count: 5, required_count: 6 }),
          loyaltyCard({ program_id: "far", stamps_count: 2, required_count: 6 }),
        ],
        followed: [],
      },
      NOW,
    );

    expect(heroes).toHaveLength(4);
    expect(heroes.map((hero) => hero.kind)).toEqual(["voucher", "progress", "progress", "map"]);
    expect(heroes[1]).toMatchObject({ kind: "progress", remaining: 1 });
  });

  it("places ready cashback after stamp momentum and deep-links to its wallet card", () => {
    const heroes = pickHomeHeroes(
      {
        campaignVouchers: [],
        loyaltyVouchers: [],
        loyaltyCards: [
          loyaltyCard({ business_id: "tea", stamps_count: 5, required_count: 6 }),
          loyaltyCard({
            business_id: "cash",
            type: "points",
            required_count: null,
            points_balance: 180,
            min_redeem_points: 250,
            cashback_per_point: "1.00",
            reward_summary: "5% cashback",
          }),
        ],
        followed: [],
      },
      NOW,
    );

    expect(heroes[1]).toMatchObject({
      kind: "cashback",
      amount: 180,
      progressPct: 72,
      rewardLabel: "5% cashback",
      ready: false,
      href: "/loyalty?business=cash",
    });
  });

  it("promotes a populated map after the first reward when more than ten places are nearby", () => {
    const businesses = Array.from({ length: 11 }, (_, index) => nearbyBusiness(index));
    const heroes = pickHomeHeroes(
      {
        campaignVouchers: [],
        loyaltyVouchers: [],
        loyaltyCards: [loyaltyCard({ stamps_count: 5, required_count: 6 })],
        followed: [],
        nearbyBusinesses: businesses,
        promoteMap: true,
      },
      NOW,
    );

    expect(heroes[1]).toMatchObject({ kind: "map", businesses });
  });
});
