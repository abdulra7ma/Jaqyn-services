import { describe, expect, it } from "vitest";
import { formatDistanceKm, haversineKm } from "./distance";

// Minimal translator that returns the key suffix for clarity in assertions.
function t(key: string): string {
  if (key === "nearby.distance") return "km";
  if (key === "cmp.distance.m") return "m";
  return key;
}

// ---- haversineKm ---------------------------------------------------------------

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    const a = { lat: 42.87, lng: 74.59 };
    expect(haversineKm(a, a)).toBe(0);
  });

  it("returns a reasonable distance for Bishkek→Almaty (~196 km)", () => {
    // Bishkek: 42.8746° N, 74.5698° E
    // Almaty:  43.2565° N, 76.9286° E
    // Actual great-circle distance ≈ 196 km (road distance is ~230 km).
    const bishkek = { lat: 42.8746, lng: 74.5698 };
    const almaty = { lat: 43.2565, lng: 76.9286 };
    const km = haversineKm(bishkek, almaty);
    // Accept ±5 km tolerance on the WGS-84 approximation.
    expect(km).toBeGreaterThan(190);
    expect(km).toBeLessThan(202);
  });

  it("is symmetric", () => {
    const a = { lat: 42.87, lng: 74.59 };
    const b = { lat: 42.88, lng: 74.61 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 8);
  });
});

// ---- formatDistanceKm ----------------------------------------------------------

describe("formatDistanceKm — metres branch (< 1 km)", () => {
  it("formats 450 m correctly (design example)", () => {
    expect(formatDistanceKm(0.45, t)).toBe("450 m");
  });

  it("formats 800 m correctly (design example)", () => {
    expect(formatDistanceKm(0.8, t)).toBe("800 m");
  });

  it("rounds to nearest 10 (445 m → 450 m)", () => {
    expect(formatDistanceKm(0.445, t)).toBe("450 m");
  });

  it("rounds to nearest 10 (444 m → 440 m)", () => {
    expect(formatDistanceKm(0.444, t)).toBe("440 m");
  });

  it("rounds to nearest 10 (5 m → 10 m)", () => {
    expect(formatDistanceKm(0.005, t)).toBe("10 m");
  });

  it("rounds to nearest 10 (4 m → 0 m)", () => {
    // Very close points round down to 0 — acceptable edge case.
    expect(formatDistanceKm(0.004, t)).toBe("0 m");
  });

  it("boundary: 999 m stays as metres", () => {
    // 0.999 km → 999 m rounded to nearest 10 → 1000 m → falls through to km
    // Actually 999 rounded to nearest 10 = 1000, so it becomes "1.0 km".
    // Let's use 0.994 → 994 → rounds to 990 → "990 m"
    expect(formatDistanceKm(0.994, t)).toBe("990 m");
  });

  it("boundary: 995 m rounds to 1000 m → shown as 1.0 km", () => {
    // 0.995 km → 995 m → rounds to nearest 10 = 1000 m → shown as "1.0 km"
    expect(formatDistanceKm(0.995, t)).toBe("1.0 km");
  });
});

describe("formatDistanceKm — kilometres branch (≥ 1 km)", () => {
  it("formats exactly 1 km (boundary ≥ 1)", () => {
    expect(formatDistanceKm(1, t)).toBe("1.0 km");
  });

  it("formats 1.4 km (design example)", () => {
    expect(formatDistanceKm(1.4, t)).toBe("1.4 km");
  });

  it("formats 1.4 km with rounding (1.44 → 1.4)", () => {
    expect(formatDistanceKm(1.44, t)).toBe("1.4 km");
  });

  it("formats larger distances (12.5 km)", () => {
    expect(formatDistanceKm(12.5, t)).toBe("12.5 km");
  });
});
