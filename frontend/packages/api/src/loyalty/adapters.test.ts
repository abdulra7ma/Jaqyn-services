// Contract tests for the loyalty adapters.
//
// D2 (pagination): the backend now wraps CustomerCardsView and
// CustomerBusinessLoyaltyView in the standard {count, next, previous, results}
// envelope. The loyalty api layer (loyalty/api.ts) reads data.results and maps
// through adaptLoyaltyCard — this suite confirms that the adapter produces the
// correct domain object from a raw backend card row, mirroring what the live
// endpoint returns inside `results`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { adaptLoyaltyCard, adaptLoyaltyProgram } from "./adapters";

// Minimal raw loyalty-card row matching the LoyaltyCardSerializer output.
function rawCard(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    program_id: "p-1",
    business_id: "b-1",
    business_name: "Manas Coffee",
    business_logo_url: null,
    business_card_accent: "",
    business_category: "cafe",
    business_area: "center",
    business_hours: {},
    business_lat: null,
    business_lng: null,
    type: "stamp",
    name: "Coffee card",
    reward_summary: "6 stamps → free coffee",
    reward_expiry_days: 30,
    last_activity_at: null,
    joined: true,
    stamps_count: 3,
    visits_count: 0,
    required_count: 6,
    points_balance: 0,
    min_redeem_points: null,
    points_per_som: null,
    cashback_per_point: null,
    pct_back: null,
    tiers: [],
    current_tier_name: null,
    next_tier_name: null,
    next_tier_visits_left: null,
    ...over,
  };
}

test("adaptLoyaltyCard maps a standard backend card row to LoyaltyCardView", () => {
  const card = adaptLoyaltyCard(rawCard());
  assert.equal(card.program_id, "p-1");
  assert.equal(card.business_name, "Manas Coffee");
  assert.equal(card.type, "stamp");
  assert.equal(card.stamps_count, 3);
  assert.equal(card.required_count, 6);
  assert.equal(card.joined, true);
});

test("adaptLoyaltyCard degrades unknown type to 'stamp'", () => {
  const card = adaptLoyaltyCard(rawCard({ type: "unknown_future_type" }));
  assert.equal(card.type, "stamp");
});

test("adaptLoyaltyCard maps tiers array correctly", () => {
  const card = adaptLoyaltyCard(rawCard({
    tiers: [
      { name: "Silver", min_visits: 10, cashback_percent: "3.00" },
      { name: "Gold", min_visits: 30, cashback_percent: "5.00" },
    ],
    current_tier_name: "Silver",
    next_tier_name: "Gold",
    next_tier_visits_left: 20,
  }));
  assert.equal(card.tiers.length, 2);
  assert.equal(card.tiers[0]?.name, "Silver");
  assert.equal(card.tiers[1]?.cashback_percent, "5.00");
  assert.equal(card.current_tier_name, "Silver");
  assert.equal(card.next_tier_name, "Gold");
  assert.equal(card.next_tier_visits_left, 20);
});

// D2 envelope unwrap: the API layer does `data.results.map(adaptLoyaltyCard)`.
// This test simulates that pattern to confirm the adapter handles paginated rows.
test("cards and businessProgramsForCustomer envelope unwrap (D2 contract)", () => {
  // Simulate what loyaltyApi.cards does after the paginator adds count/next/previous.
  const paginatedResponse = {
    count: 2,
    next: null,
    previous: null,
    results: [rawCard({ program_id: "p-1", name: "Card A" }), rawCard({ program_id: "p-2", name: "Card B" })],
  };
  const cards = paginatedResponse.results.map(adaptLoyaltyCard);
  assert.equal(cards.length, 2);
  assert.equal(cards[0]?.name, "Card A");
  assert.equal(cards[1]?.name, "Card B");
});

test("adaptLoyaltyCard handles nullable geo coords (business_lat/lng)", () => {
  // Backend emits null when the business has no coordinates set.
  const card = adaptLoyaltyCard(rawCard({ business_lat: null, business_lng: null }));
  assert.equal(card.business_lat, null);
  assert.equal(card.business_lng, null);
});

test("adaptLoyaltyProgram passes through the raw program config", () => {
  // adaptLoyaltyProgram is a cast — the raw object is the config as-is.
  const raw = { id: "prog-1", type: "stamp", name: "Card", status: "active", description: "" } as Record<string, unknown>;
  const prog = adaptLoyaltyProgram(raw);
  assert.equal(prog.id, "prog-1");
  assert.equal(prog.type, "stamp");
});
