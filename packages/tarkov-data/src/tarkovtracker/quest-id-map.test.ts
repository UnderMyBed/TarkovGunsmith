import { describe, expect, it } from "vitest";
import { buildIdMap } from "./quest-id-map.js";
import type { TaskListItem } from "../queries/tasks.js";

function task(id: string | null, normalizedName: string): TaskListItem {
  return {
    id,
    name: normalizedName,
    normalizedName,
    kappaRequired: null,
    trader: { normalizedName: "prapor" },
  };
}

describe("buildIdMap", () => {
  it("produces a gameId → normalizedName map of the same length as the input", () => {
    const tasks = [
      task("5ac23c6186f7741247042bad", "gunsmith-part-1"),
      task("5936d90786f7742b1420ba5b", "debut"),
      task("59674eb386f774539f14813a", "delivery-from-the-past"),
    ];
    const map = buildIdMap(tasks);
    expect(Object.keys(map)).toHaveLength(3);
    expect(map["5ac23c6186f7741247042bad"]).toBe("gunsmith-part-1");
    expect(map["5936d90786f7742b1420ba5b"]).toBe("debut");
    expect(map["59674eb386f774539f14813a"]).toBe("delivery-from-the-past");
  });

  it("drops tasks with null id and deduplicates by first-wins", () => {
    const tasks = [
      task(null, "orphan"),
      task("5ac23c6186f7741247042bad", "first"),
      task("5ac23c6186f7741247042bad", "second"),
    ];
    const map = buildIdMap(tasks);
    expect(Object.keys(map)).toHaveLength(1);
    expect(map["5ac23c6186f7741247042bad"]).toBe("first");
  });
});
