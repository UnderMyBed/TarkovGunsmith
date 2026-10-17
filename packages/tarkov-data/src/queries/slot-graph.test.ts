import { describe, expect, it } from "vitest";
import {
  buildSlotGraph,
  expandSlots,
  selectWeaponTree,
  slotAtPath,
  slotLabels,
  visibleSlots,
} from "./slot-graph.js";
import { fixtureClient } from "../__fixtures__/client.js";
import { tinyTree } from "../__test-utils__/tiny-tree.js";
import { fixtureSnapshot, fixtureWeaponTree } from "../__test-utils__/fixture-snapshot.js";
import { snapshotWeaponTree } from "../snapshot/views.js";
import type { ItemsDocument } from "./documents.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_UPPER = "55d355e64bdc2d962f8b4569";
const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
const USGI_FLASH_HIDER = "544a38634bdc2d58388b4568";
const DD_MK12_GAS_BLOCK = "56eabcd4d2720b66698b4574";
const ELCAN = "57ac965c24597706be5f975c";
const HAMR = "544a3a774bdc2d3a388b4567";
const AMMO = "54527a984bdc2d4e668b4567";
const BAD_LEVER = "675307301f7c19a9780f2668";

/** A realistic M4A1 build, all real fixture items, three levels deep under the barrel. */
const M4A1_BUILD = {
  mod_pistol_grip: "55d4b9964bdc2d1d4e8b456e",
  mod_reciever: M4A1_UPPER,
  "mod_reciever/mod_barrel": BARREL_10_3,
  "mod_reciever/mod_barrel/mod_muzzle": USGI_FLASH_HIDER,
  "mod_reciever/mod_handguard": "5b2cfa535acfc432ff4db7a0",
  "mod_reciever/mod_scope": HAMR,
  mod_stock: "5a33ca0fc4a282000d72292f",
  "mod_stock/mod_stock": "5a33cae9c4a28232980eb086",
  mod_charge: "55d44fd14bdc2d962f8b456e",
} as const;

describe("snapshotWeaponTree", () => {
  it("returns the weapon's own slots, with ids, paths and named options", async () => {
    const tree = await fixtureWeaponTree(fixtureClient(), M4A1);
    expect(tree.weaponId).toBe(M4A1);
    expect(tree.weaponName).toMatch(/M4A1/);
    expect(tree.slots.map((s) => s.nameId)).toEqual([
      "mod_pistol_grip",
      "mod_magazine",
      "mod_reciever",
      "mod_stock",
      "mod_charge",
      "mod_charge_001",
    ]);
    for (const slot of tree.slots) {
      expect(slot.path).toBe(slot.nameId);
      expect(slot.id).toMatch(/^[0-9a-f]{24}$/);
      expect(slot.allowedItemIds).toBeInstanceOf(Set);
      // Lazy: a node never carries its subtree.
      expect(slot).not.toHaveProperty("children");
      for (const item of slot.allowedItems) expect(item.name).not.toBe(item.id);
    }
  });

  it("shares one graph across trees from the same snapshot", async () => {
    const { snapshot } = await fixtureSnapshot();
    const a = snapshotWeaponTree(snapshot, M4A1);
    const b = snapshotWeaponTree(snapshot, "5448bd6b4bdc2dfc2f8b4569");
    expect(a.graph).toBe(b.graph);
  });

  it("throws for an id that is not a buildable weapon in the snapshot", async () => {
    const { snapshot } = await fixtureSnapshot();
    expect(() => snapshotWeaponTree(snapshot, AMMO)).toThrow(/not in the game data/);
  });
});

describe("selectWeaponTree", () => {
  it("throws for a missing id and for a non-weapon", async () => {
    const doc = await fixtureClient().fetchResource<ItemsDocument>("items");
    expect(() => selectWeaponTree(doc, "no-such-id")).toThrow(/not found/);
    expect(() => selectWeaponTree(doc, AMMO)).toThrow(/not a weapon/);
  });

  it("falls back to the lookup key, and an empty tree, for a bare weapon record", () => {
    const tree = selectWeaponTree(
      { items: { "bare-weapon-id": { properties: { propertiesType: "ItemPropertiesWeapon" } } } },
      "bare-weapon-id",
    );
    expect(tree.weaponId).toBe("bare-weapon-id");
    expect(tree.weaponName).toBe("bare-weapon-id");
    expect(tree.slots).toEqual([]);
  });
});

describe("buildSlotGraph", () => {
  it("records slots on every owning type, barrels and scopes included", async () => {
    const graph = buildSlotGraph(await fixtureClient().fetchResource<ItemsDocument>("items"));
    expect(graph.owners[BARREL_10_3]?.kind).toBe("ItemPropertiesBarrel");
    expect(graph.owners[ELCAN]?.kind).toBe("ItemPropertiesScope");
    expect(graph.owners[M4A1]?.kind).toBe("ItemPropertiesWeapon");
  });

  it("resolves categories and falls back for malformed slot fields", () => {
    const graph = buildSlotGraph({
      items: {
        owner: {
          properties: {
            propertiesType: "ItemPropertiesWeaponMod",
            slots: [
              {
                filters: {
                  allowedItems: ["named", "unnamed", 42, "no-such-item"],
                  allowedCategories: [
                    "cat1",
                    "no-such-category",
                    null,
                    "missingId",
                    { id: "inline", name: "Inline", normalizedName: "inline" },
                  ],
                },
              },
              { nameId: "slot2" },
              null,
            ],
          },
        },
        untyped: { properties: { slots: [{ nameId: "s" }] } },
        named: { name: "Named Item", properties: { propertiesType: "ItemPropertiesWeaponMod" } },
        unnamed: { properties: { propertiesType: "ItemPropertiesWeaponMod" } },
      },
      itemCategories: {
        cat1: { id: "cat1", name: "Category One", normalizedName: "category-one" },
        missingId: { name: "N", normalizedName: "nn" },
      },
    });
    const [first, second] = expandSlots(graph, "owner", "");
    expect(first?.nameId).toBe("");
    expect(first?.name).toBe("");
    expect(first?.id).toBe("");
    expect(first?.allowedItems).toEqual([
      { id: "named", name: "Named Item" },
      { id: "unnamed", name: "unnamed" },
    ]);
    expect(first?.allowedCategories.map((c) => c.id)).toEqual(["cat1", "inline"]);
    expect(second?.name).toBe("slot2");
    expect(second?.allowedItems).toEqual([]);
    expect(expandSlots(graph, "owner", "")[2]?.nameId).toBe("");
    expect(graph.owners.untyped?.kind).toBe("");
  });

  it("names an option by its id when the graph carries no name for it", () => {
    const graph = {
      owners: {
        w: {
          kind: "ItemPropertiesWeapon",
          slots: [
            {
              id: "s",
              nameId: "s",
              name: "S",
              required: false,
              allowedItemIds: ["z"],
              allowedCategories: [],
            },
          ],
        },
      },
      itemNames: {},
      itemShortNames: {},
    };
    expect(expandSlots(graph, "w", "")[0]?.allowedItems).toEqual([{ id: "z", name: "z" }]);
  });
});

describe("expanding from attached items", () => {
  it("reaches a barrel's required gas block, which the old tree never showed", async () => {
    const tree = await fixtureWeaponTree(fixtureClient(), M4A1);
    const gasBlock = slotAtPath(tree, M4A1_BUILD, "mod_reciever/mod_barrel/mod_gas_block");
    expect(gasBlock).not.toBeNull();
    expect(gasBlock!.required).toBe(true);
    // The upstream slot id, which conflictingSlotIds refers to.
    expect(gasBlock!.id).toBe("56ea8e15d2720bf2698b456b");
    expect(gasBlock!.allowedItemIds.has(DD_MK12_GAS_BLOCK)).toBe(true);
  });

  it("goes past the old depth cap of three", async () => {
    const tree = await fixtureWeaponTree(fixtureClient(), M4A1);
    const paths = visibleSlots(tree, M4A1_BUILD).map((s) => s.path);
    expect(paths).toContain("mod_reciever/mod_barrel/mod_muzzle/mod_muzzle");
    expect(paths).toContain("mod_reciever/mod_scope/mod_scope");
  });

  it("only expands what is attached", async () => {
    const tree = await fixtureWeaponTree(fixtureClient(), M4A1);
    const paths = visibleSlots(tree, {}).map((s) => s.path);
    expect(paths).toEqual(tree.slots.map((s) => s.path));
  });

  it("does not expand an attachment its slot does not allow", async () => {
    const tree = await fixtureWeaponTree(fixtureClient(), M4A1);
    const paths = visibleSlots(tree, { mod_stock: M4A1_UPPER }).map((s) => s.path);
    expect(paths.some((p) => p.startsWith("mod_stock/"))).toBe(false);
  });

  it("stops at an item attached beneath itself", () => {
    const tree = tinyTree("w", [{ nameId: "s", items: [["a", [{ nameId: "s", items: ["a"] }]]] }]);
    const paths = visibleSlots(tree, { s: "a", "s/s": "a", "s/s/s": "a" }).map((x) => x.path);
    expect(paths).toEqual(["s", "s/s"]);
  });

  it("resolves every key of a saved depth-1..3 build, unchanged", async () => {
    // Saved v6 builds key attachments by `/`-joined nameId paths. Expanding lazily from the
    // attached item must produce exactly those paths, or old share links would lose parts.
    const tree = await fixtureWeaponTree(fixtureClient(), M4A1);
    for (const [path, itemId] of Object.entries(M4A1_BUILD)) {
      const slot = slotAtPath(tree, M4A1_BUILD, path);
      expect(slot?.path, path).toBe(path);
      expect(slot!.allowedItemIds.has(itemId), path).toBe(true);
    }
  });

  it("returns null for a path whose parent slot is empty or unknown", async () => {
    const tree = await fixtureWeaponTree(fixtureClient(), M4A1);
    expect(slotAtPath(tree, {}, "mod_reciever/mod_barrel")).toBeNull();
    expect(slotAtPath(tree, M4A1_BUILD, "mod_nope")).toBeNull();
    expect(slotAtPath(tree, M4A1_BUILD, "mod_reciever/mod_nope")).toBeNull();
  });
});

describe("slot labels", () => {
  const short = (id: string) => `short-${id}`;
  const slot = (name: string, ...allowedItemIds: string[]) => ({ name, allowedItemIds });

  it("leaves a name no sibling shares as it is, even on a single-item slot", () => {
    expect(slotLabels([slot("Muzzle", "a", "b"), slot("Magazine", "m")], short)).toEqual([
      "Muzzle",
      "Magazine",
    ]);
  });

  it("qualifies a repeated name on a single-item slot with that item's short name", () => {
    expect(slotLabels([slot("Ch. Handle", "a", "b"), slot("Ch. Handle", "bad")], short)).toEqual([
      "Ch. Handle",
      "Ch. Handle (short-bad)",
    ]);
  });

  it("numbers every member of a name that still repeats, in upstream order", () => {
    expect(
      slotLabels(
        [slot("Mount", "a", "b"), slot("Tactical", "t"), slot("Mount", "c", "d"), slot("Mount")],
        short,
      ),
    ).toEqual(["Mount 1", "Tactical", "Mount 2", "Mount 3"]);
  });

  it("skips a number a sibling's own name already holds", () => {
    expect(
      slotLabels([slot("Mount", "a", "b"), slot("Mount", "c", "d"), slot("Mount 1", "e")], short),
    ).toEqual(["Mount 2", "Mount 3", "Mount 1"]);
  });

  it("falls back to the item id when its short name is blank", () => {
    const blank = (id: string) => (id === "e" ? "" : "  ");
    expect(
      slotLabels([slot("Mount", "e"), slot("Mount", "w"), slot("Mount", "x", "y")], blank),
    ).toEqual(["Mount (e)", "Mount (w)", "Mount"]);
  });

  it("numbers single-item slots whose qualified labels still collide", () => {
    expect(slotLabels([slot("Stock", "s"), slot("Stock", "s")], short)).toEqual([
      "Stock (short-s) 1",
      "Stock (short-s) 2",
    ]);
  });

  it("labels the M4A1's second charging-handle slot by its lever, from the snapshot", async () => {
    const tree = await fixtureWeaponTree(fixtureClient(), M4A1);
    expect(tree.slots.map((s) => [s.path, s.name, s.label])).toEqual([
      ["mod_pistol_grip", "Pistol Grip", "Pistol Grip"],
      ["mod_magazine", "Magazine", "Magazine"],
      ["mod_reciever", "Receiver", "Receiver"],
      ["mod_stock", "Stock", "Stock"],
      ["mod_charge", "Ch. Handle", "Ch. Handle"],
      ["mod_charge_001", "Ch. Handle", "Ch. Handle (B.A.D.)"],
    ]);
    // The label is display-only: the path a saved build keys on is untouched.
    expect(slotAtPath(tree, {}, "mod_charge_001")?.allowedItemIds).toEqual(new Set([BAD_LEVER]));
  });

  it("falls back to the item id when the graph has no short name for it", () => {
    const def = (id: string) => ({
      id,
      nameId: id,
      name: "Mount",
      required: false,
      allowedItemIds: ["z"],
      allowedCategories: [],
    });
    const graph = {
      owners: { w: { kind: "ItemPropertiesWeapon", slots: [def("a"), def("b")] } },
      itemNames: {},
      itemShortNames: {},
    };
    expect(expandSlots(graph, "w", "").map((s) => s.label)).toEqual(["Mount (z) 1", "Mount (z) 2"]);
  });

  it("labels the same way from the raw items document", async () => {
    const doc = await fixtureClient().fetchResource<ItemsDocument>("items");
    const tree = selectWeaponTree(doc, M4A1);
    expect(tree.slots.map((s) => s.label)).toContain("Ch. Handle (B.A.D.)");
    expect(tree.graph.itemShortNames[BAD_LEVER]).toBe("B.A.D.");
  });
});
