import { describe, expect, it } from "vitest";
import {
  attachedParts,
  fleaPriceRub,
  mountedAttachments,
  withAttachment,
} from "./attached-parts.js";
import { conflictsWith } from "./conflicts.js";
import { fetchPartCatalog, partsById } from "./queries/parts.js";
import { fetchWeaponTree } from "./queries/weaponTree.js";
import { fixtureClient } from "./__fixtures__/client.js";
import { tinyTree } from "./__test-utils__/tiny-tree.js";

const STANAG_MAG = "55d4887d4bdc2d962f8b4570";
const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_UPPER = "55d355e64bdc2d962f8b4569";
const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
const A2_20 = "68a63ac58e1fe612970728f2";
const M4A1_FRONT_SIGHT_GAS_BLOCK = "5ae30e795acfc408fb139a0b";
const COLT_A2_FLASH_HIDER = "544a38634bdc2d58388b4568";
const AX15_4 = "63f4ba71f31d4a33b87bd046";
/** The A2 20" barrel's gas-block slot, which the AX-15 4" handguard lists as conflicting. */
const A2_GAS_BLOCK_SLOT = "68a63ac58e1fe612970728f5";

const BARREL = "mod_reciever/mod_barrel";
const GAS_BLOCK = `${BARREL}/mod_gas_block`;
const MUZZLE = `${BARREL}/mod_muzzle`;
const HANDGUARD = "mod_reciever/mod_handguard";

async function m4a1() {
  const client = fixtureClient();
  const [tree, parts] = await Promise.all([
    fetchWeaponTree(client, M4A1),
    fetchPartCatalog(client),
  ]);
  return { tree, parts: partsById(parts) };
}

describe("withAttachment", () => {
  const start = { a: "x", "a/b": "y", "a/b/c": "z", ab: "w" };

  it("sets a new item and drops every key beneath the replaced one", () => {
    expect(withAttachment(start, "a", "x2")).toEqual({ a: "x2", ab: "w" });
  });

  it("clears an item and every key beneath it", () => {
    expect(withAttachment(start, "a/b", null)).toEqual({ a: "x", ab: "w" });
  });

  it("keeps the subtree when the same item is selected again", () => {
    expect(withAttachment(start, "a", "x")).toEqual(start);
  });

  it("fills an empty slot without touching siblings", () => {
    expect(withAttachment({ a: "x" }, "a/b", "y")).toEqual({ a: "x", "a/b": "y" });
  });
});

describe("mountedAttachments", () => {
  const tree = tinyTree("w", [
    { nameId: "top", items: [["p", [{ nameId: "child", items: ["c"] }]], "q"] },
    { nameId: "other", items: ["c"] },
  ]);

  it("keeps only keys whose slot is shown and accepts the item", () => {
    expect(
      mountedAttachments(tree, {
        top: "q",
        "top/child": "c", // orphan: q has no child slot
        other: "p", // known part, not allowed in this slot
        "nowhere/deep": "c",
      }),
    ).toEqual({ top: "q" });
  });

  it("keeps an id no slot in the document allows, so drift can report it", () => {
    expect(mountedAttachments(tree, { top: "p", "top/child": "gone" })).toEqual({
      top: "p",
      "top/child": "gone",
    });
  });
});

describe("attachedParts", () => {
  it("returns one entry per slot, so a part in two slots counts twice", async () => {
    const tree = tinyTree("w", [
      { nameId: "mod_magazine", items: [STANAG_MAG] },
      { nameId: "mod_x", items: [["holder", [{ nameId: "mod_magazine", items: [STANAG_MAG] }]]] },
      { nameId: "mod_barrel", items: [BARREL_10_3] },
    ]);
    const byId = partsById(await fetchPartCatalog(fixtureClient()));
    const { entries, missing } = attachedParts(
      tree,
      {
        mod_magazine: STANAG_MAG,
        mod_x: "holder",
        "mod_x/mod_magazine": STANAG_MAG,
        mod_barrel: BARREL_10_3,
      },
      byId,
    );
    expect(entries.map((e) => [e.path, e.part.id])).toEqual([
      ["mod_magazine", STANAG_MAG],
      ["mod_x/mod_magazine", STANAG_MAG],
      ["mod_barrel", BARREL_10_3],
    ]);
    expect(missing).toEqual([{ path: "mod_x", itemId: "holder" }]);
  });

  it("reports each mounted attachment the catalog cannot resolve", async () => {
    const tree = tinyTree("w", [
      { nameId: "a", items: ["x"] },
      { nameId: "b", items: ["x"] },
      { nameId: "c", items: [STANAG_MAG] },
    ]);
    const byId = partsById(await fetchPartCatalog(fixtureClient()));
    const { entries, missing } = attachedParts(
      tree,
      { a: "gone", b: "gone", c: STANAG_MAG, "a/deep": "gone" },
      byId,
    );
    expect(entries).toHaveLength(1);
    expect(missing).toEqual([
      { path: "a", itemId: "gone" },
      { path: "b", itemId: "gone" },
    ]);
  });

  it("stops counting a removed barrel's gas block and muzzle, even if their keys remain", async () => {
    const { tree, parts } = await m4a1();
    const withBarrel = {
      mod_reciever: M4A1_UPPER,
      [BARREL]: BARREL_10_3,
      [GAS_BLOCK]: M4A1_FRONT_SIGHT_GAS_BLOCK,
      [MUZZLE]: COLT_A2_FLASH_HIDER,
    };
    const weight = (att: Record<string, string>) =>
      attachedParts(tree, att, parts).entries.reduce((t, e) => t + e.part.weight, 0);
    const price = (att: Record<string, string>) =>
      attachedParts(tree, att, parts).entries.reduce((t, e) => t + fleaPriceRub(e.part), 0);
    const upperOnly = { mod_reciever: M4A1_UPPER };

    // A saved build that still carries the stale keys counts the same as the clean one.
    const staleKeys: Record<string, string> = { ...withBarrel };
    delete staleKeys[BARREL];
    expect(attachedParts(tree, staleKeys, parts).entries.map((e) => e.path)).toEqual([
      "mod_reciever",
    ]);
    expect(weight(staleKeys)).toBe(weight(upperOnly));
    expect(price(staleKeys)).toBe(price(upperOnly));

    // Removing the barrel through withAttachment drops the keys outright.
    expect(withAttachment(withBarrel, BARREL, null)).toEqual(upperOnly);
    expect(weight(withBarrel)).toBeGreaterThan(weight(upperOnly));
  });
});

describe('replacing a barrel under an AX-15 4" handguard (PR #240 review repro)', () => {
  const start = {
    mod_reciever: M4A1_UPPER,
    [BARREL]: BARREL_10_3,
    [GAS_BLOCK]: M4A1_FRONT_SIGHT_GAS_BLOCK,
    [HANDGUARD]: AX15_4,
  };

  it('starts from a build with no conflicts, where the A2 20" barrel is offered', async () => {
    const { tree, parts } = await m4a1();
    const ctx = { tree, attachments: start, parts };
    expect(conflictsWith(ctx, { itemId: AX15_4, path: HANDGUARD })).toEqual([]);
    expect(conflictsWith(ctx, { itemId: A2_20, path: BARREL })).toEqual([]);
  });

  it("a swap that kept the old gas block would hide a conflict with the handguard", async () => {
    const { tree, parts } = await m4a1();
    const keptSubtree = { ...start, [BARREL]: A2_20 };
    expect(
      conflictsWith({ tree, attachments: keptSubtree, parts }, { itemId: AX15_4, path: HANDGUARD }),
    ).toEqual([
      {
        kind: "slot",
        withItemId: M4A1_FRONT_SIGHT_GAS_BLOCK,
        atPath: GAS_BLOCK,
        slotId: A2_GAS_BLOCK_SLOT,
      },
    ]);
  });

  it("drops the gas block on the swap, so no conflict remains and the gas block option is disabled", async () => {
    const { tree, parts } = await m4a1();
    const after = withAttachment(start, BARREL, A2_20);
    expect(after).toEqual({ mod_reciever: M4A1_UPPER, [BARREL]: A2_20, [HANDGUARD]: AX15_4 });

    const ctx = { tree, attachments: after, parts };
    expect(conflictsWith(ctx, { itemId: AX15_4, path: HANDGUARD })).toEqual([]);
    // Re-fitting the gas block under the A2 is now refused, naming the handguard.
    expect(conflictsWith(ctx, { itemId: M4A1_FRONT_SIGHT_GAS_BLOCK, path: GAS_BLOCK })).toEqual([
      expect.objectContaining({ withItemId: AX15_4, atPath: HANDGUARD }),
    ]);
  });
});

describe("fleaPriceRub", () => {
  it("reads the flea offer, and 0 without one", async () => {
    const parts = await fetchPartCatalog(fixtureClient());
    const withFlea = parts.find((p) =>
      (p.buyFor ?? []).some((b) => b.vendor.__typename === "FleaMarket" && b.priceRUB !== null),
    )!;
    const flea = withFlea.buyFor!.find((b) => b.vendor.__typename === "FleaMarket")!;
    expect(fleaPriceRub(withFlea)).toBe(flea.priceRUB);
    expect(fleaPriceRub({ ...withFlea, buyFor: [] })).toBe(0);
    expect(fleaPriceRub({ ...withFlea, buyFor: null })).toBe(0);
  });
});
