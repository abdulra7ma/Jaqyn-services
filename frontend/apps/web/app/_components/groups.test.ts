import { describe, expect, it } from "vitest";
import { buildVisitSlots, hhmm } from "./groups";

describe("buildVisitSlots", () => {
  it("returns no more than four upcoming slots from the current local time", () => {
    const now = new Date(2026, 6, 5, 10, 10, 0);
    const slots = buildVisitSlots("03:00", "18:00", 30, now);

    expect(slots.map(hhmm)).toEqual(["10:30", "11:00", "11:30", "12:00"]);
  });

  it("returns no stale fallback after today's offer window has ended", () => {
    const now = new Date(2026, 6, 5, 19, 0, 0);

    expect(buildVisitSlots("03:00", "18:00", 30, now)).toEqual([]);
  });

  it("waits for the offer opening when it starts later today", () => {
    const now = new Date(2026, 6, 5, 10, 0, 0);

    expect(buildVisitSlots("14:00", "18:00", 30, now).map(hhmm)).toEqual([
      "14:00",
      "14:30",
      "15:00",
      "15:30",
    ]);
  });
});
