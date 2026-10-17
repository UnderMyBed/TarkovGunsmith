import { describe, it, expect } from "vitest";
import { shownSlots, slotDiff, weaponChangeOf, type ChangedRow } from "./slot-diff.js";
import { DEFAULT_PROFILE, partsById, type AttachablePart } from "@tarkov/data";
import { tinyTree } from "../../../test/tiny-tree.js";

const slotTree = tinyTree("w1", [
  { nameId: "muzzle", name: "Muzzle", items: ["m-old", "m-new"] },
  { nameId: "handguard", name: "Handguard", items: ["h-new"] },
  { nameId: "stock", name: "Stock", items: [] },
]);

const partList: readonly AttachablePart[] = [
  {
    id: "m-old",
    name: "Old Muzzle",
    shortName: "OldMuz",
    iconLink: "https://example.com/img.png",
    weight: 0.1,
    types: [],
    minLevelForFlea: null,
    properties: {
      propertiesType: "ItemPropertiesWeaponMod",
      ergonomics: 2,
      recoilModifier: -0.05,
      accuracyModifier: 0,
    },
    conflictingItems: [],
    conflictingSlotIds: [],
    buyFor: [
      {
        priceRUB: 10_000,
        currency: "RUB",
        vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 15 },
      },
    ],
  },
  {
    id: "m-new",
    name: "New Muzzle",
    shortName: "NewMuz",
    iconLink: "https://example.com/img.png",
    weight: 0.1,
    types: [],
    minLevelForFlea: null,
    properties: {
      propertiesType: "ItemPropertiesWeaponMod",
      ergonomics: 3,
      recoilModifier: -0.09,
      accuracyModifier: 0,
    },
    conflictingItems: [],
    conflictingSlotIds: [],
    buyFor: [
      {
        priceRUB: 22_000,
        currency: "RUB",
        vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 15 },
      },
    ],
  },
  {
    id: "h-new",
    name: "New Handguard",
    shortName: "NewHG",
    iconLink: "https://example.com/img.png",
    weight: 0.2,
    types: [],
    minLevelForFlea: null,
    properties: {
      propertiesType: "ItemPropertiesWeaponMod",
      ergonomics: 4,
      recoilModifier: -0.02,
      accuracyModifier: 0,
    },
    conflictingItems: [],
    conflictingSlotIds: [],
    buyFor: [
      {
        priceRUB: 8_000,
        currency: "RUB",
        vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 15 },
      },
    ],
  },
];

const parts = partsById(partList);

describe("slotDiff", () => {
  it("emits one ChangedRow per swapped slot in slot-tree order", () => {
    const rows = slotDiff(
      { muzzle: "m-old", stock: "s-keep" },
      { muzzle: "m-new", handguard: "h-new", stock: "s-keep" },
      slotTree,
      parts,
      null,
    );
    expect(rows.map((r) => r.slotId)).toEqual(["muzzle", "handguard"]);
  });

  it("marks added slot with currentName=null", () => {
    const [hg] = slotDiff(
      { muzzle: "m-old" },
      { muzzle: "m-old", handguard: "h-new" },
      slotTree,
      parts,
      null,
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
      parts,
      null,
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
      parts,
      null,
    );
    expect(rows).toEqual([]);
  });

  it("treats a part the catalog does not hold as not on the weapon: an emptied slot", () => {
    const [row] = slotDiff({ muzzle: "m-old" }, { muzzle: "m-missing" }, slotTree, parts, null);
    expect(row).toMatchObject({
      slotId: "muzzle",
      currentName: "Old Muzzle",
      proposedName: null,
      proposedErgo: 0,
      proposedRecoil: 0,
    });
  });

  it("prices under the gate: a part the profile cannot buy has no price, and no delta", () => {
    const noFlea = { ...DEFAULT_PROFILE, flea: false };
    const [row] = slotDiff({ muzzle: "m-old" }, { muzzle: "m-new" }, slotTree, parts, noFlea);
    expect(row).toMatchObject({ currentPrice: null, proposedPrice: null, priceDelta: null });
  });

  it("prices an empty slot at 0", () => {
    const [row] = slotDiff({}, { muzzle: "m-new" }, slotTree, parts, null);
    expect(row).toMatchObject({ currentPrice: 0, proposedPrice: 22_000, priceDelta: 22_000 });
  });

  it("computes per-row deltas (proposed minus current)", () => {
    const [row] = slotDiff({ muzzle: "m-old" }, { muzzle: "m-new" }, slotTree, parts, null);
    expect(row).toMatchObject<Partial<ChangedRow>>({
      ergoDelta: 1, // 3 - 2
      priceDelta: 12_000, // 22_000 - 10_000
    });
    // recoilDelta keeps upstream's fractional unit: -0.09 - -0.05 = -0.04,
    // i.e. 4 percentage points less recoil. toBeCloseTo because subtracting
    // binary fractions leaves noise (-0.04000000000000001).
    expect(row?.recoilDelta).toBeCloseTo(-0.04, 10);
  });

  it("ignores keys that are not on the weapon", () => {
    const rows = slotDiff(
      { muzzle: "m-old", "tac-device": "t-old", "handguard/rail": "r-old" },
      { muzzle: "m-new", handguard: "h-new", "tac-device": "t-new" },
      slotTree,
      parts,
      null,
    );
    expect(rows.map((r) => r.slotId)).toEqual(["muzzle", "handguard"]);
  });
});

describe("shownSlots", () => {
  it("lists each slot either build shows once, the current build's first", () => {
    const tree = tinyTree("w1", [
      { nameId: "a", name: "A", items: [["p", [{ nameId: "x", name: "X", items: ["c"] }]], "q"] },
      { nameId: "b", name: "B", items: [["r", [{ nameId: "y", name: "Y", items: ["c"] }]]] },
    ]);
    expect(shownSlots(tree, { a: "p" }, { a: "q", b: "r" }).map((s) => s.path)).toEqual([
      "a",
      "a/x",
      "b",
      "b/y",
    ]);
  });
});

describe("slotDiff with a preset's parts", () => {
  it("prices a part the build's preset comes with at 0, unchanged slots taking it first", () => {
    // Both builds carry m-old once, in an unchanged slot; the current one also in the muzzle.
    const tree = tinyTree("w1", [
      { nameId: "muzzle", name: "Muzzle", items: ["m-old", "m-new"] },
      { nameId: "stock", name: "Stock", items: ["m-old"] },
    ]);
    const covers = new Map([["m-old", 1]]);
    const [row] = slotDiff(
      { muzzle: "m-old", stock: "m-old" },
      { muzzle: "m-new", stock: "m-old" },
      tree,
      parts,
      null,
      { current: covers, proposed: covers },
    );
    // The preset's one m-old is the stock's on both sides, so the muzzle's is paid for.
    expect(row).toMatchObject({ currentPrice: 10_000, proposedPrice: 22_000, priceDelta: 12_000 });

    const [onlyCovered] = slotDiff({ muzzle: "m-old" }, { muzzle: "m-new" }, tree, parts, null, {
      current: covers,
      proposed: new Map(),
    });
    expect(onlyCovered).toMatchObject({ currentPrice: 0, priceDelta: 22_000 });
  });
});

describe("weaponChangeOf", () => {
  const row = (priceDelta: number | null) => ({ priceDelta }) as ChangedRow;
  const priced = (totalRUB: number, presetId: string | null) =>
    ({ status: "priced", totalRUB, presetId }) as const;

  it("is the cost change the rows leave over when the weapon is bought another way", () => {
    expect(
      weaponChangeOf(priced(26_666, "carbine"), priced(80_000, null), [row(10_000)], (id) =>
        id === null ? "M4A1" : "M4A1 Carbine",
      ),
    ).toEqual({ from: "M4A1 Carbine", to: "M4A1", priceDelta: 43_334 });
  });

  it("is absent when both buy the weapon the same way, or either has no path", () => {
    expect(weaponChangeOf(priced(1, "p"), priced(2, "p"), [], String)).toBeNull();
    expect(weaponChangeOf(null, priced(2, "p"), [], String)).toBeNull();
    expect(
      weaponChangeOf({ status: "unobtainable", missing: ["w"] }, priced(2, "p"), [], String),
    ).toBeNull();
  });

  it("has no price when any price it rests on is unknown", () => {
    const unknown = { status: "unknown", knownRUB: 1, unpriced: ["x"], presetId: null } as const;
    expect(weaponChangeOf(priced(1, "p"), unknown, [], String)?.priceDelta).toBeNull();
    expect(
      weaponChangeOf(priced(1, "p"), priced(5, null), [row(null)], String)?.priceDelta,
    ).toBeNull();
  });
});
