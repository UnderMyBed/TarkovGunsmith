import { describe, expect, it } from "vitest";
import { filterRowsByName } from "./filterRows.js";

const rows = [
  { id: "1", name: "M855" },
  { id: "2", name: "M995" },
  { id: "3", name: "PS gs" },
];

describe("filterRowsByName", () => {
  it("returns all rows when query is empty", () => {
    expect(filterRowsByName(rows, "")).toEqual(rows);
  });

  it("returns all rows when query is only whitespace", () => {
    expect(filterRowsByName(rows, "   ")).toEqual(rows);
  });

  it("filters by case-insensitive substring on name", () => {
    const out = filterRowsByName(rows, "m8");
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("1");
  });

  it("matches mixed case queries", () => {
    expect(filterRowsByName(rows, "PS")).toHaveLength(1);
    expect(filterRowsByName(rows, "ps")).toHaveLength(1);
  });

  it("returns empty when nothing matches", () => {
    expect(filterRowsByName(rows, "xyz")).toEqual([]);
  });
});
