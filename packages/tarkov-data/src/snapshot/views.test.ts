import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "../__test-utils__/fixture-snapshot.js";
import { BuildV6, ORPHANED_CAP } from "../build-schema.js";
import {
  orphanUnknownParts,
  snapshotPart,
  snapshotPartCatalog,
  snapshotPriceIds,
  snapshotSlotGraph,
  snapshotWeaponTree,
} from "./views.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
const SCREW_NUTS = "57347c77245977448d35f6e2";

describe("snapshotSlotGraph", () => {
  it("is built once per snapshot and names every allowed item", async () => {
    const { snapshot } = await fixtureSnapshot();
    const graph = snapshotSlotGraph(snapshot);
    expect(snapshotSlotGraph(snapshot)).toBe(graph);
    expect(snapshotWeaponTree(snapshot, M4A1).graph).toBe(graph);
    expect(graph.owners).toBe(snapshot.slots);
    for (const owner of Object.values(graph.owners)) {
      for (const slot of owner.slots) {
        for (const id of slot.allowedItemIds) expect(graph.itemNames[id]).toBeDefined();
      }
    }
  });
});

describe("snapshotPartCatalog", () => {
  it("fails loudly on a snapshot that lost an item's offers", async () => {
    const { snapshot, prices } = await fixtureSnapshot();
    const offers = { ...snapshot.offers };
    delete offers[BARREL_10_3];
    expect(() => snapshotPartCatalog({ ...snapshot, offers }, prices.prices)).toThrow(
      `builder-snapshot.json has no offers for ${BARREL_10_3}`,
    );
  });
});

describe("snapshotPart", () => {
  it("prices one part exactly as the catalog does, and knows nothing of other ids", async () => {
    const { snapshot, prices } = await fixtureSnapshot();
    const fromCatalog = snapshotPartCatalog(snapshot, prices.prices).find(
      (p) => p.id === BARREL_10_3,
    );
    expect(snapshotPart(snapshot, prices.prices, BARREL_10_3)).toEqual(fromCatalog);
    expect(snapshotPart(snapshot, prices.prices, M4A1)).toBeUndefined();
  });
});

describe("snapshotPriceIds", () => {
  it("lists every id an offer's price depends on, sorted", async () => {
    const { snapshot, prices } = await fixtureSnapshot();
    const ids = snapshotPriceIds(snapshot);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain(M4A1);
    expect(ids).toContain(SCREW_NUTS);
    // The generator priced exactly these ids that the documents hold.
    for (const id of Object.keys(prices.prices.items)) expect(ids).toContain(id);
  });
});

describe("orphanUnknownParts", () => {
  it("moves ids the game data does not hold into orphaned, once each", async () => {
    const { snapshot } = await fixtureSnapshot();
    const result = orphanUnknownParts(
      snapshot,
      {
        mod_reciever: "55d355e64bdc2d962f8b4569",
        "mod_reciever/mod_barrel": BARREL_10_3,
        mod_stock: "gone-upstream",
        mod_charge: "also-gone",
        mod_pistol_grip: "gone-upstream",
      },
      ["also-gone", "kept-from-before"],
    );
    expect(result).toEqual({
      attachments: {
        mod_reciever: "55d355e64bdc2d962f8b4569",
        "mod_reciever/mod_barrel": BARREL_10_3,
      },
      orphaned: ["also-gone", "kept-from-before", "gone-upstream"],
    });
  });
});

describe("orphanUnknownParts at the cap", () => {
  it("never passes the cap a saved build must respect, keeping the ids it just found", async () => {
    const { snapshot } = await fixtureSnapshot();
    const earlier = Array.from(
      { length: ORPHANED_CAP },
      (_, i) => `old-${String(i).padStart(2, "0")}`,
    );
    const result = orphanUnknownParts(
      snapshot,
      { mod_stock: "new-b", mod_charge: "new-a", mod_reciever: "55d355e64bdc2d962f8b4569" },
      earlier,
    );
    expect(result.orphaned).toHaveLength(ORPHANED_CAP);
    // Oldest dropped; new ids appended in slot-path order (mod_charge before mod_stock).
    expect(result.orphaned.slice(0, 2)).toEqual(["old-02", "old-03"]);
    expect(result.orphaned.slice(-2)).toEqual(["new-a", "new-b"]);
    expect(BuildV6.shape.orphaned.safeParse(result.orphaned).success).toBe(true);
  });
});
