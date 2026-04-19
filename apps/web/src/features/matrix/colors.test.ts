import { describe, expect, it } from "vitest";
import { shotsToBreakBucket } from "./colors.js";

describe("shotsToBreakBucket", () => {
  it("returns 'none' for Infinity (cannot break)", () => {
    expect(shotsToBreakBucket(Number.POSITIVE_INFINITY)).toBe("none");
  });

  it("returns 'great' for 1-3 shots", () => {
    expect(shotsToBreakBucket(1)).toBe("great");
    expect(shotsToBreakBucket(2)).toBe("great");
    expect(shotsToBreakBucket(3)).toBe("great");
  });

  it("returns 'good' for 4-8 shots", () => {
    expect(shotsToBreakBucket(4)).toBe("good");
    expect(shotsToBreakBucket(8)).toBe("good");
  });

  it("returns 'fair' for 9-15 shots", () => {
    expect(shotsToBreakBucket(9)).toBe("fair");
    expect(shotsToBreakBucket(15)).toBe("fair");
  });

  it("returns 'poor' for 16+ shots", () => {
    expect(shotsToBreakBucket(16)).toBe("poor");
    expect(shotsToBreakBucket(100)).toBe("poor");
  });

  it("returns 'none' for non-positive shot counts (defensive)", () => {
    expect(shotsToBreakBucket(0)).toBe("none");
    expect(shotsToBreakBucket(-1)).toBe("none");
  });
});
