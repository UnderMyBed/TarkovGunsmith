import { describe, expect, it } from "vitest";
import { barrelDeviation } from "./barrelDeviation.js";

// Curves and maxima are live values (2026-10-17): weapon deviationCurve spans 1..3.5, barrel
// deviationMax 7.5..33. Expected figures are computed from upstream's own formula.
describe("barrelDeviation", () => {
  it("is 1 at full durability on a 1.0 curve", () => {
    expect(barrelDeviation(1, 100)).toBe(1);
  });

  it("stays within 1.0025 at full durability across the live curves", () => {
    expect(barrelDeviation(1.35, 23)).toBeCloseTo(1.0000172, 7);
    expect(barrelDeviation(3.5, 33)).toBeCloseTo(1.0024445, 7);
    expect(barrelDeviation(3.5, 100)).toBeCloseTo(1.0024604, 7);
  });

  it("widens dispersion as the barrel wears", () => {
    expect(barrelDeviation(1.35, 23, 50)).toBeCloseTo(3.0857461, 6);
    expect(barrelDeviation(1.35, 23, 50)).toBeGreaterThan(barrelDeviation(1.35, 23));
  });

  it("takes upstream's linear branch when the curve makes the quadratic degenerate", () => {
    // 100 − 2 × 50 = 0: upstream divides durability by 2 × curve instead.
    expect(barrelDeviation(50, 100)).toBe(1);
    expect(barrelDeviation(50, 100, 50)).toBeCloseTo(50.25, 9);
  });
});
