import { describe, it, expect } from "vitest";
import { slotDiff, type ChangedRow } from "./slot-diff.js";
import type { ModListItem, WeaponTree } from "@tarkov/data";

const slotTree: WeaponTree = {
  weaponId: "w1",
  slots: [
    { path: "muzzle", name: "Muzzle", nameId: "muzzle", allowedItems: [] },
    { path: "handguard", name: "Handguard", nameId: "handguard", allowedItems: [] },
    { path: "stock", name: "Stock", nameId: "stock", allowedItems: [] },
  ],
} as unknown as WeaponTree;

const modList: readonly ModListItem[] = [
  {
    id: "m-old",
    name: "Old Muzzle",
    shortName: "OldMuz",
    iconLink: "https://example.com/img.png",
    weight: 0.1,
    types: [],
    minLevelForFlea: null,
    properties: {
      __typename: "ItemPropertiesWeaponMod",
      ergonomics: 2,
      recoilModifier: -5,
      accuracyModifier: 0,
    },
    buyFor: [
      {
        priceRUB: 10_000,
        currency: "RUB",
        vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 15 },
      },
    ],
    craftsFor: null,
    bartersFor: null,
  } as ModListItem,
  {
    id: "m-new",
    name: "New Muzzle",
    shortName: "NewMuz",
    iconLink: "https://example.com/img.png",
    weight: 0.1,
    types: [],
    minLevelForFlea: null,
    properties: {
      __typename: "ItemPropertiesWeaponMod",
      ergonomics: 3,
      recoilModifier: -9,
      accuracyModifier: 0,
    },
    buyFor: [
      {
        priceRUB: 22_000,
        currency: "RUB",
        vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 15 },
      },
    ],
    craftsFor: null,
    bartersFor: null,
  } as ModListItem,
  {
    id: "h-new",
    name: "New Handguard",
    shortName: "NewHG",
    iconLink: "https://example.com/img.png",
    weight: 0.2,
    types: [],
    minLevelForFlea: null,
    properties: {
      __typename: "ItemPropertiesWeaponMod",
      ergonomics: 4,
      recoilModifier: -2,
      accuracyModifier: 0,
    },
    buyFor: [
      {
        priceRUB: 8_000,
        currency: "RUB",
        vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 15 },
      },
    ],
    craftsFor: null,
    bartersFor: null,
  } as ModListItem,
];

describe("slotDiff", () => {
  it("emits one ChangedRow per swapped slot in slot-tree order", () => {
    const rows = slotDiff(
      { muzzle: "m-old", stock: "s-keep" },
      { muzzle: "m-new", handguard: "h-new", stock: "s-keep" },
      slotTree,
      modList,
    );
    expect(rows.map((r) => r.slotId)).toEqual(["muzzle", "handguard"]);
  });

  it("marks added slot with currentName=null", () => {
    const [hg] = slotDiff(
      { muzzle: "m-old" },
      { muzzle: "m-old", handguard: "h-new" },
      slotTree,
      modList,
    );
    expect(hg).toMatchObject({
      slotId: "handguard",
      currentName: null,
      proposedName: "New Handguard",
    });
  });

  it("marks removed slot with proposedName=null", () => {
    const [row] = slotDiff(
      { muzzle: "m-old", handguard: "h-new" },
      { muzzle: "m-old" },
      slotTree,
      modList,
    );
    expect(row).toMatchObject({
      slotId: "handguard",
      currentName: "New Handguard",
      proposedName: null,
    });
  });

  it("excludes unchanged slots", () => {
    const rows = slotDiff(
      { muzzle: "m-old", handguard: "h-new" },
      { muzzle: "m-old", handguard: "h-new" },
      slotTree,
      modList,
    );
    expect(rows).toEqual([]);
  });

  it("falls back to the mod id when the mod is missing from modList", () => {
    const [row] = slotDiff({ muzzle: "m-old" }, { muzzle: "m-missing" }, slotTree, modList);
    expect(row).toMatchObject({
      proposedName: "m-missing",
      proposedErgo: 0,
      proposedRecoil: 0,
      proposedPrice: 0,
    });
  });

  it("computes per-row deltas (proposed minus current)", () => {
    const [row] = slotDiff({ muzzle: "m-old" }, { muzzle: "m-new" }, slotTree, modList);
    expect(row).toMatchObject<Partial<ChangedRow>>({
      ergoDelta: 1, // 3 - 2
      recoilDelta: -4, // -9 - -5
      priceDelta: 12_000, // 22_000 - 10_000
    });
  });

  it("appends fallback rows for slot paths outside the tree, after tree-ordered rows", () => {
    const rows = slotDiff(
      { muzzle: "m-old", "tac-device": "t-old" },
      { muzzle: "m-new", handguard: "h-new", "tac-device": "t-new" },
      slotTree,
      modList,
    );
    expect(rows.map((r) => r.slotId)).toEqual(["muzzle", "handguard", "tac-device"]);
    // Fallback rows get an uppercased slotLabel since they aren't in the tree.
    expect(rows[2]).toMatchObject({ slotId: "tac-device", slotLabel: "TAC-DEVICE" });
  });
});
