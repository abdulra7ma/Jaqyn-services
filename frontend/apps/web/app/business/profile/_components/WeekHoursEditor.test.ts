import { describe, expect, it } from "vitest";
import { formatWeek, readWeek, weekToPayload } from "./WeekHoursEditor";

const label = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

describe("WeekHoursEditor helpers", () => {
  it("readWeek keeps array spans and drops legacy/absent days", () => {
    const w = readWeek({ mon: ["09:00", "21:00"], display: "Mon-Fri 9-9" });
    expect(w.mon).toEqual(["09:00", "21:00"]);
    expect(w.tue).toBeNull();
  });

  it("weekToPayload emits only open days", () => {
    const payload = weekToPayload({
      mon: ["09:00", "21:00"],
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: null,
    });
    expect(payload).toEqual({ mon: ["09:00", "21:00"] });
  });

  it("formatWeek groups consecutive identical days and skips closed", () => {
    const raw = {
      mon: ["09:00", "21:00"],
      tue: ["09:00", "21:00"],
      wed: ["09:00", "21:00"],
      thu: ["09:00", "21:00"],
      fri: ["09:00", "21:00"],
      sat: ["10:00", "16:00"],
      // sun closed
    };
    expect(formatWeek(raw, label)).toBe("Mon–Fri 09:00–21:00, Sat 10:00–16:00");
  });

  it("formatWeek returns empty string when nothing is set", () => {
    expect(formatWeek(null, label)).toBe("");
    expect(formatWeek({ display: "whatever" }, label)).toBe("");
  });
});
