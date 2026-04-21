import { describe, expect, it } from "vitest";
import { mapRawToProfile } from "./mapping.js";
import type { RawProgression } from "./types.js";
import type { TaskListItem } from "../queries/tasks.js";
import rawFixture from "./__fixtures__/raw-progression.json" with { type: "json" };

function task(id: string | null, normalizedName: string): TaskListItem {
  return {
    id,
    name: normalizedName,
    normalizedName,
    kappaRequired: null,
    trader: { normalizedName: "prapor" },
  };
}

const TASKS: readonly TaskListItem[] = [
  task("5ac23c6186f7741247042bad", "gunsmith-part-1"),
  task("5936d90786f7742b1420ba5b", "debut"),
  task("59674eb386f774539f14813a", "delivery-from-the-past"),
];

describe("mapRawToProfile", () => {
  it("maps three complete tasks to normalizedName slugs and sets flea=true at level 25", () => {
    const raw = rawFixture as RawProgression;
    const result = mapRawToProfile(raw, TASKS);
    expect(result.profile.completedQuests).toEqual(
      expect.arrayContaining(["gunsmith-part-1", "debut", "delivery-from-the-past"]),
    );
    expect(result.profile.completedQuests).toHaveLength(3);
    expect(result.profile.flea).toBe(true);
    expect(result.meta.questCount).toBe(3);
    expect(result.meta.playerLevel).toBe(25);
    expect(result.meta.unmappedCount).toBe(0);
  });

  it("sets flea=false when playerLevel < 20", () => {
    const raw = { ...(rawFixture as RawProgression), playerLevel: 19 };
    const result = mapRawToProfile(raw, TASKS);
    expect(result.profile.flea).toBe(false);
  });

  it("filters out tasks marked invalid", () => {
    const raw: RawProgression = {
      ...(rawFixture as RawProgression),
      tasksProgress: [
        { id: "5ac23c6186f7741247042bad", complete: true, invalid: true },
        { id: "5936d90786f7742b1420ba5b", complete: true },
      ],
    };
    const result = mapRawToProfile(raw, TASKS);
    expect(result.profile.completedQuests).toEqual(["debut"]);
  });

  it("filters out tasks marked failed", () => {
    const raw: RawProgression = {
      ...(rawFixture as RawProgression),
      tasksProgress: [
        { id: "5ac23c6186f7741247042bad", complete: true, failed: true },
        { id: "5936d90786f7742b1420ba5b", complete: true },
      ],
    };
    const result = mapRawToProfile(raw, TASKS);
    expect(result.profile.completedQuests).toEqual(["debut"]);
  });

  it("reports unmappedCount when a TarkovTracker id has no tarkov.dev match", () => {
    const raw: RawProgression = {
      ...(rawFixture as RawProgression),
      tasksProgress: [
        { id: "5ac23c6186f7741247042bad", complete: true },
        { id: "000000000000000000000000", complete: true },
      ],
    };
    const result = mapRawToProfile(raw, TASKS);
    expect(result.profile.completedQuests).toEqual(["gunsmith-part-1"]);
    expect(result.meta.unmappedCount).toBe(1);
  });
});
