import { describe, expect, it } from "vitest";
import { ergonomicsFloorNote, shownErgonomics } from "./ergonomics.js";

describe("shownErgonomics", () => {
  it("floors a negative sum at 0, as the game does", () => {
    expect(shownErgonomics(-23)).toBe(0);
    expect(shownErgonomics(-0.5)).toBe(0);
  });

  it("leaves 0 and positive sums as they are", () => {
    expect(shownErgonomics(0)).toBe(0);
    expect(shownErgonomics(55)).toBe(55);
    expect(shownErgonomics(12.5)).toBe(12.5);
  });
});

describe("ergonomicsFloorNote", () => {
  it("names the raw sum below the floor, with a true minus", () => {
    expect(ergonomicsFloorNote(-23)).toBe("−23 before the game's floor at 0");
    expect(ergonomicsFloorNote(-22.5)).toBe("−22.5 before the game's floor at 0");
  });

  it("drops a trailing .0 and float noise", () => {
    expect(ergonomicsFloorNote(-23.000000000000004)).toBe("−23 before the game's floor at 0");
  });

  it("has nothing to say at or above the floor", () => {
    expect(ergonomicsFloorNote(0)).toBeUndefined();
    expect(ergonomicsFloorNote(48)).toBeUndefined();
  });
});
