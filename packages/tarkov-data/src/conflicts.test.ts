import { describe, expect, it } from "vitest";
import { fixturePartCatalog, fixtureWeaponTree } from "./__test-utils__/fixture-snapshot.js";
import { conflictsWith } from "./conflicts.js";
import { partsById, type AttachablePart } from "./queries/parts.js";
import { fixtureClient } from "./__fixtures__/client.js";
import { tinyTree } from "./__test-utils__/tiny-tree.js";

const M4A1 = "5447a9cd4bdc2dbd208b4567";
const M4A1_UPPER = "55d355e64bdc2d962f8b4569";
const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
const BARREL_14_5 = "55d3632e4bdc2d972f8b4569";
const BARREL_A2_20 = "68a63ac58e1fe612970728f2";
const AEROKNOX_10_5 = "619b5db699fb192e7430664f";
const AEROKNOX_4 = "63f4ba71f31d4a33b87bd046";
const USGI_FLASH_HIDER = "544a38634bdc2d58388b4568";
const BARREL = "mod_reciever/mod_barrel";
const HANDGUARD = "mod_reciever/mod_handguard";
const MUZZLE = "mod_reciever/mod_barrel/mod_muzzle";

async function ctx(attachments: Record<string, string>) {
  const client = fixtureClient();
  const [tree, parts] = await Promise.all([
    fixtureWeaponTree(client, M4A1),
    fixturePartCatalog(client),
  ]);
  return { tree, attachments, parts: partsById(parts) };
}

describe("conflictsWith over real upstream conflict data", () => {
  it("flags an item pair listed by the candidate", async () => {
    // The Aeroknox 10.5" handguard lists the 10.3" barrel; the barrel does not list it back.
    const c = await ctx({ mod_reciever: M4A1_UPPER, [BARREL]: BARREL_10_3 });
    expect(conflictsWith(c, { itemId: AEROKNOX_10_5, path: HANDGUARD })).toEqual([
      { kind: "item", withItemId: BARREL_10_3, atPath: BARREL },
    ]);
  });

  it("flags the same pair from the side that does not list it", async () => {
    const c = await ctx({ mod_reciever: M4A1_UPPER, [HANDGUARD]: AEROKNOX_10_5 });
    const parts = c.parts;
    expect(parts.get(BARREL_10_3)!.conflictingItems).not.toContain(AEROKNOX_10_5);
    expect(conflictsWith(c, { itemId: BARREL_10_3, path: BARREL })).toEqual([
      { kind: "item", withItemId: AEROKNOX_10_5, atPath: HANDGUARD },
    ]);
  });

  it("passes a part neither side lists", async () => {
    const c = await ctx({ mod_reciever: M4A1_UPPER, [HANDGUARD]: AEROKNOX_10_5 });
    expect(conflictsWith(c, { itemId: BARREL_14_5, path: BARREL })).toEqual([]);
  });

  it("flags a candidate that would block a filled slot", async () => {
    // The Aeroknox 4" handguard blocks the A2 20" barrel's muzzle, gas-block and launcher slots.
    const c = await ctx({
      mod_reciever: M4A1_UPPER,
      [BARREL]: BARREL_A2_20,
      [MUZZLE]: USGI_FLASH_HIDER,
    });
    expect(conflictsWith(c, { itemId: AEROKNOX_4, path: HANDGUARD })).toEqual([
      {
        kind: "slot",
        withItemId: USGI_FLASH_HIDER,
        atPath: MUZZLE,
        slotId: "68a63ac58e1fe612970728f4",
      },
    ]);
  });

  it("flags a candidate going into a slot an attached part blocks", async () => {
    const c = await ctx({
      mod_reciever: M4A1_UPPER,
      [BARREL]: BARREL_A2_20,
      [HANDGUARD]: AEROKNOX_4,
    });
    expect(conflictsWith(c, { itemId: USGI_FLASH_HIDER, path: MUZZLE })).toEqual([
      {
        kind: "slot",
        withItemId: AEROKNOX_4,
        atPath: HANDGUARD,
        slotId: "68a63ac58e1fe612970728f4",
      },
    ]);
  });
});

describe("conflictsWith — what counts as the rest of the build", () => {
  function part(id: string, conflictingItems: string[] = []): AttachablePart {
    return {
      id,
      name: id,
      shortName: id,
      iconLink: "https://assets.tarkov.dev/x.webp",
      weight: 0.1,
      types: ["mods"],
      minLevelForFlea: null,
      properties: {
        propertiesType: "ItemPropertiesWeaponMod",
        ergonomics: 0,
        recoilModifier: 0,
        accuracyModifier: 0,
      },
      buyFor: [],
      conflictingItems,
      conflictingSlotIds: [],
    };
  }
  const tree = tinyTree("w", [
    { nameId: "a", items: [["holder", [{ nameId: "b", items: ["x"] }]], "holder2"] },
    { nameId: "c", items: ["y"] },
  ]);
  const parts = partsById([part("holder"), part("holder2", ["x"]), part("x"), part("y", ["x"])]);

  it("ignores the occupant being replaced and everything beneath it", () => {
    // `holder2` lists `x`, but `x` sits under `a`, which `holder2` is replacing.
    const c = { tree, parts, attachments: { a: "holder", "a/b": "x" } };
    expect(conflictsWith(c, { itemId: "holder2", path: "a" })).toEqual([]);
  });

  it("ignores attachments the build does not show", () => {
    // `a/b` holds `x`, but `a` is empty, so `x` is not on the weapon.
    const c = { tree, parts, attachments: { "a/b": "x" } };
    expect(conflictsWith(c, { itemId: "y", path: "c" })).toEqual([]);
  });

  it("checks the rest", () => {
    const c = { tree, parts, attachments: { a: "holder", "a/b": "x" } };
    expect(conflictsWith(c, { itemId: "y", path: "c" })).toEqual([
      { kind: "item", withItemId: "x", atPath: "a/b" },
    ]);
  });
});
