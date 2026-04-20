import { describe, expect, it } from "vitest";
import { sortRows } from "./sortRows.js";

const rows = [
  { id: "a", name: "Charlie", damage: 30 },
  { id: "b", name: "Alpha", damage: 50 },
  { id: "c", name: "Bravo", damage: 40 },
];

describe("sortRows", () => {
  it("sorts by string key ascending (locale-aware)", () => {
    const out = sortRows(rows, "name", "asc");
    expect(out.map((r) => r.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by string key descending", () => {
    const out = sortRows(rows, "name", "desc");
    expect(out.map((r) => r.name)).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("sorts by numeric key ascending", () => {
    const out = sortRows(rows, "damage", "asc");
    expect(out.map((r) => r.damage)).toEqual([30, 40, 50]);
  });

  it("sorts by numeric key descending", () => {
    const out = sortRows(rows, "damage", "desc");
    expect(out.map((r) => r.damage)).toEqual([50, 40, 30]);
  });

  it("does not mutate the input", () => {
    const copy = [...rows];
    sortRows(rows, "damage", "asc");
    expect(rows).toEqual(copy);
  });

  it("is stable for equal keys", () => {
    const dupes = [
      { id: "a", name: "X", damage: 10 },
      { id: "b", name: "X", damage: 10 },
    ];
    const out = sortRows(dupes, "damage", "asc");
    expect(out[0]!.id).toBe("a");
    expect(out[1]!.id).toBe("b");
  });
});
