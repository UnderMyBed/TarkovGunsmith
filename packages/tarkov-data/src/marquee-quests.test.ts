import { describe, expect, it } from "vitest";
import { MARQUEE_QUEST_NORMALIZED_NAMES } from "./marquee-quests.js";

describe("MARQUEE_QUEST_NORMALIZED_NAMES", () => {
  it("contains exactly 20 entries", () => {
    expect(MARQUEE_QUEST_NORMALIZED_NAMES.length).toBe(20);
  });
  it("has no duplicates", () => {
    expect(new Set(MARQUEE_QUEST_NORMALIZED_NAMES).size).toBe(20);
  });
  it("uses kebab-case (normalizedName) slugs", () => {
    for (const name of MARQUEE_QUEST_NORMALIZED_NAMES) {
      expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
