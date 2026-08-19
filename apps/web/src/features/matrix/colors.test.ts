import { describe, expect, it } from "vitest";
import { shotsToBreakBucket } from "./colors.js";

describe("shotsToBreakBucket", () => {
  it("returns 'none' for Infinity (cannot break)", () => {
    expect(shotsToBreakBucket(Number.POSITIVE_INFINITY)).toBe("none");
  });

  // Thresholds follow the live distribution's quartiles (p25 52, p50 102,
  // p75 203) — see the note on shotsToBreakBucket.
  it("returns 'great' up to 50 shots", () => {
    expect(shotsToBreakBucket(1)).toBe("great");
    expect(shotsToBreakBucket(3)).toBe("great"); // live minimum
    expect(shotsToBreakBucket(50)).toBe("great");
  });

  it("returns 'good' for 51-100 shots", () => {
    expect(shotsToBreakBucket(51)).toBe("good");
    expect(shotsToBreakBucket(100)).toBe("good");
  });

  it("returns 'fair' for 101-200 shots", () => {
    expect(shotsToBreakBucket(101)).toBe("fair");
    expect(shotsToBreakBucket(200)).toBe("fair");
  });

  it("returns 'poor' above 200 shots", () => {
    expect(shotsToBreakBucket(201)).toBe("poor");
    expect(shotsToBreakBucket(510)).toBe("poor"); // live maximum durability
  });

  it("returns 'none' for non-positive shot counts (defensive)", () => {
    expect(shotsToBreakBucket(0)).toBe("none");
    expect(shotsToBreakBucket(-1)).toBe("none");
  });
});
