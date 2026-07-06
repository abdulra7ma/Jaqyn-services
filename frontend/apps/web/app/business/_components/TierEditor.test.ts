import { describe, expect, it } from "vitest";
import { draftsToTiers, tiersToDrafts } from "./TierEditor";

const row = (name: string, visits: string, percent: string) => ({ name, visits, percent });

describe("draftsToTiers", () => {
  it("accepts a valid ascending ladder starting at 0", () => {
    const tiers = draftsToTiers([row("Bronze", "0", "3"), row("Silver", "5", "5"), row("Gold", "10", "8")]);
    expect(tiers).toEqual([
      { name: "Bronze", min_visits: 0, cashback_percent: "3" },
      { name: "Silver", min_visits: 5, cashback_percent: "5" },
      { name: "Gold", min_visits: 10, cashback_percent: "8" },
    ]);
  });

  it("rejects a first rung above 0 visits", () => {
    expect(draftsToTiers([row("Silver", "5", "5")])).toBeNull();
  });

  it("rejects non-increasing thresholds", () => {
    expect(draftsToTiers([row("Bronze", "0", "3"), row("Silver", "0", "5")])).toBeNull();
  });

  it("rejects duplicate names case-insensitively", () => {
    expect(draftsToTiers([row("Gold", "0", "3"), row("gold", "5", "5")])).toBeNull();
  });

  it("rejects empty names and out-of-range percents", () => {
    expect(draftsToTiers([row("  ", "0", "3")])).toBeNull();
    expect(draftsToTiers([row("Bronze", "0", "0")])).toBeNull();
    expect(draftsToTiers([row("Bronze", "0", "150")])).toBeNull();
    expect(draftsToTiers([])).toBeNull();
  });

  it("round-trips saved tiers through drafts", () => {
    const saved = [
      { name: "Fan", min_visits: 0, cashback_percent: "4.00" },
      { name: "Regular", min_visits: 8, cashback_percent: "7.50" },
    ];
    expect(draftsToTiers(tiersToDrafts(saved))).toEqual([
      { name: "Fan", min_visits: 0, cashback_percent: "4" },
      { name: "Regular", min_visits: 8, cashback_percent: "7.5" },
    ]);
  });
});
