import { describe, expect, it } from "vitest";
import type { BusinessType } from "@jaqyn/api";
import { DEFAULT_LABELS, labelSuggestions, resolveModule } from "./catalogModule";

const TYPES = [
  { id: "1", key: "cafe", name: "Cafe", glyph: "", description: "", module: "menu", sort_order: 0 },
  { id: "2", key: "gym", name: "Gym", glyph: "", description: "", module: "plans", sort_order: 1 },
] satisfies BusinessType[];

describe("resolveModule", () => {
  it("maps a business type key to its module", () => {
    expect(resolveModule("cafe", TYPES)).toBe("menu");
    expect(resolveModule("gym", TYPES)).toBe("plans");
  });
  it("falls back to menu when unknown/missing", () => {
    expect(resolveModule("nope", TYPES)).toBe("menu");
    expect(resolveModule(undefined, TYPES)).toBe("menu");
    expect(resolveModule("cafe", undefined)).toBe("menu");
  });
});

describe("labelSuggestions", () => {
  it("puts used labels first, then module defaults, de-duplicated case-insensitively", () => {
    const out = labelSuggestions("menu", ["Breakfast", "coffee"]);
    expect(out[0]).toBe("Breakfast");
    expect(out).toContain("Kitchen"); // a menu default
    // "coffee" (used) collapses with the "Coffee" default → appears once
    expect(out.filter((l) => l.toLowerCase() === "coffee")).toHaveLength(1);
  });
  it("returns the module defaults when nothing is used yet", () => {
    expect(labelSuggestions("products", [])).toEqual(DEFAULT_LABELS.products);
  });
  it("ignores blank labels", () => {
    expect(labelSuggestions("menu", ["", "  "])).toEqual(DEFAULT_LABELS.menu);
  });
});
