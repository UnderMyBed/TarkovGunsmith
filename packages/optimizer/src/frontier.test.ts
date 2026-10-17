import { describe, expect, it } from "vitest";
import { combine, prune, type FrontierContext, type Point } from "./frontier.js";
import { UNKNOWN_PRICE, type SolverPart } from "./problem.js";

const point = (stat: number, price: number, extra: Partial<Point> = {}): Point => ({
  stat,
  price,
  count: 1,
  key: "",
  counts: null,
  how: { t: "none" },
  ...extra,
});

/** A copy of `id`, pinned or not, as a counted part's own point carries it. */
const copy = (id: string, pinned = false) =>
  point(0, 0, {
    counts: new Map([
      [id, pinned ? 0 : 1],
      [`${id}!`, 1],
    ]),
  });

const solverPart = (id: string, price: number, available: boolean): SolverPart => ({
  id,
  slots: [],
  stat: 0,
  key: "",
  price,
  available,
  conflictingItems: [],
  conflictingSlotIds: [],
});

const context = (over: Partial<FrontierContext> & { cover?: number; part?: SolverPart } = {}) => {
  const part = over.part ?? solverPart("x", 5, true);
  return {
    budget: over.budget,
    path: { presetId: null, price: 0, covers: new Map(over.cover ? [["x", over.cover]] : []) },
    limited: over.limited ?? new Set<string>(),
    parts: new Map([["x", part]]),
  };
};

describe("prune", () => {
  it("keeps the best point per key with no budget: stat, then price, then count", () => {
    const kept = prune(
      [
        point(-2, 10),
        point(-2, 5, { count: 2 }),
        point(-2, 5),
        point(-1, 0),
        point(5, 0, { key: "b" }),
      ],
      undefined,
    );
    expect(kept.map((p) => [p.key, p.stat, p.price, p.count])).toEqual([
      ["", -2, 5, 1],
      ["b", 5, 0, 1],
    ]);
  });

  it("keeps the (price, stat) frontier with a budget", () => {
    const kept = prune([point(-1, 0), point(-3, 8), point(-2, 4), point(-2, 6), point(0, 2)], 10);
    expect(kept.map((p) => [p.stat, p.price])).toEqual([
      [-1, 0],
      [-2, 4],
      [-3, 8],
    ]);
  });

  it("groups by counts whatever order they were recorded in", () => {
    const ab = point(0, 1, {
      counts: new Map([
        ["a", 1],
        ["b", 1],
      ]),
    });
    const ba = point(0, 2, {
      counts: new Map([
        ["b", 1],
        ["a", 1],
      ]),
    });
    expect(prune([ab, ba], undefined)).toEqual([ab]);
  });
});

describe("combine — counted copies", () => {
  it("drops two copies of a part limited to one", () => {
    expect(combine([copy("x")], [copy("x")], context({ limited: new Set(["x"]) }))).toEqual([]);
  });

  it("counts copies a path does not supply without charging again", () => {
    const [both] = combine([copy("x")], [copy("x")], context());
    expect(both!.price).toBe(0);
    expect(both!.counts).toEqual(
      new Map([
        ["x", 2],
        ["x!", 2],
      ]),
    );
  });

  it("charges each copy past a path's cover, and caps the count at the cover", () => {
    const [both] = combine([copy("x")], [copy("x")], context({ cover: 1 }));
    expect(both!.price).toBe(5);
    expect(both!.counts).toEqual(
      new Map([
        ["x", 1],
        ["x!", 1],
      ]),
    );
  });

  it("refuses an unpinned copy past the cover of a part nobody sells", () => {
    const part = solverPart("x", UNKNOWN_PRICE, false);
    expect(combine([copy("x")], [copy("x")], context({ cover: 1, part }))).toEqual([]);
  });

  it("buys a pinned copy past the cover at an unknown price", () => {
    const part = solverPart("x", UNKNOWN_PRICE, false);
    const [both] = combine([copy("x")], [copy("x", true)], context({ cover: 1, part }));
    expect(both!.price).toBe(UNKNOWN_PRICE);
    expect(
      combine([copy("x")], [copy("x", true)], context({ cover: 1, part, budget: 100 })),
    ).toEqual([]);
  });
});
