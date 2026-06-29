import type { LoyaltyCardView } from "@jaqyn/api";
import { describe, expect, it } from "vitest";
import {
  CARD_ACCENTS,
  buildWallet,
  cardAccent,
  programReady,
  progViz,
} from "./wallet";

function card(over: Partial<LoyaltyCardView> = {}): LoyaltyCardView {
  return {
    program_id: "p1",
    business_id: "b1",
    business_name: "Cafe",
    business_logo_url: null,
    business_category: "cafe",
    business_area: "Center",
    business_hours: {},
    type: "stamp",
    name: "Stamps",
    reward_summary: "Free coffee",
    reward_expiry_days: 30,
    joined: true,
    stamps_count: 0,
    visits_count: 0,
    required_count: 6,
    points_balance: 0,
    points_per_som: null,
    cashback_per_point: null,
    pct_back: null,
    ...over,
  };
}

describe("programReady", () => {
  it("stamp ready when count reaches target", () => {
    expect(programReady(card({ stamps_count: 6, required_count: 6 }))).toBe(true);
    expect(programReady(card({ stamps_count: 5, required_count: 6 }))).toBe(false);
  });
  it("visit ready when count reaches target", () => {
    expect(programReady(card({ type: "visit", visits_count: 3, required_count: 3 }))).toBe(true);
  });
  it("plain points (no cashback rate) is never ready for customers", () => {
    expect(programReady(card({ type: "points", points_balance: 9999, required_count: 1 }))).toBe(
      false,
    );
  });
  it("cashback is ready when there's a spendable balance", () => {
    expect(
      programReady(card({ type: "points", cashback_per_point: "1.00", points_balance: 120 })),
    ).toBe(true);
    expect(
      programReady(card({ type: "points", cashback_per_point: "1.00", points_balance: 0 })),
    ).toBe(false);
  });
  it("no target → not ready", () => {
    expect(programReady(card({ stamps_count: 99, required_count: null }))).toBe(false);
  });
});

describe("progViz", () => {
  it("small stamp target → dots", () => {
    expect(progViz(card({ stamps_count: 4, required_count: 6 }))).toEqual({
      kind: "dots",
      filled: 4,
      total: 6,
    });
  });
  it("large target → bar with percent", () => {
    expect(progViz(card({ stamps_count: 10, required_count: 20 }))).toEqual({
      kind: "bar",
      pct: 50,
    });
  });
  it("points → cashback number via rate", () => {
    expect(
      progViz(card({ type: "points", points_balance: 100, cashback_per_point: "0.5" })),
    ).toEqual({ kind: "number", value: 50 });
  });
});

describe("cardAccent", () => {
  it("is deterministic and a known accent", () => {
    expect(cardAccent("b1")).toBe(cardAccent("b1"));
    expect(CARD_ACCENTS).toContain(cardAccent("some-business-id"));
  });
});

describe("buildWallet", () => {
  it("groups by business, preserves order, flags ready, lists programs", () => {
    const wallet = buildWallet([
      card({ business_id: "a", program_id: "a1", stamps_count: 1, required_count: 6 }),
      card({ business_id: "b", program_id: "b1", stamps_count: 6, required_count: 6 }),
      card({ business_id: "a", program_id: "a2", type: "visit", visits_count: 0, required_count: 3 }),
    ]);
    expect(wallet.map((w) => w.businessId)).toEqual(["a", "b"]);
    expect(wallet[0]!.programs).toHaveLength(2);
    expect(wallet[0]!.ready).toBe(false); // a: 1/6 stamp + 0/3 visit
    expect(wallet[1]!.ready).toBe(true); // b: 6/6 stamp
  });
});
