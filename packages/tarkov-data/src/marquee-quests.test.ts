import { describe, expect, it } from "vitest";
import { MARQUEE_QUEST_NORMALIZED_NAMES } from "./marquee-quests.js";
import tasksFixture from "./__fixtures__/tasks-sample.json" with { type: "json" };

describe("marquee quests", () => {
  it("lists 36 quests", () => {
    expect(MARQUEE_QUEST_NORMALIZED_NAMES).toHaveLength(36);
  });

  it("no longer references the retired gunsmith-part-N names", () => {
    for (const name of MARQUEE_QUEST_NORMALIZED_NAMES) {
      expect(name).not.toMatch(/^gunsmith-part-\d+$/);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(MARQUEE_QUEST_NORMALIZED_NAMES).size).toBe(
      MARQUEE_QUEST_NORMALIZED_NAMES.length,
    );
  });

  it("names sampled from the list exist in live-shaped upstream data", () => {
    const known = new Set(
      Object.values(tasksFixture.document.data.tasks).map((t) => t.normalizedName),
    );
    for (const name of ["gunsmith-master-part-1", "gunsmith-m4a1", "setup", "eagle-eye"]) {
      expect(MARQUEE_QUEST_NORMALIZED_NAMES).toContain(name);
      expect(known.has(name)).toBe(true);
    }
  });
});
