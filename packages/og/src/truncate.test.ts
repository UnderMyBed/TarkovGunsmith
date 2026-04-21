import { describe, expect, it } from "vitest";
import { truncate } from "./truncate.js";

describe("truncate", () => {
  it("returns the input when under the limit", () => {
    expect(truncate("M4A1", 22)).toBe("M4A1");
  });

  it("returns the input when exactly at the limit", () => {
    expect(truncate("A".repeat(22), 22)).toBe("A".repeat(22));
  });

  it("truncates longer input and appends an ellipsis", () => {
    expect(truncate("A".repeat(30), 22)).toBe(`${"A".repeat(21)}…`);
  });

  it("is safe on empty input", () => {
    expect(truncate("", 22)).toBe("");
  });

  it("throws when max < 2 (can't fit 1 char + ellipsis)", () => {
    expect(() => truncate("abc", 1)).toThrow(/max/);
  });
});
