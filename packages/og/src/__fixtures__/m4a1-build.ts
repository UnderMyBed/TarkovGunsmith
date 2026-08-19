import type { BuildV5 } from "@tarkov/data";

/**
 * Hand-constructed BuildV5 + weapon/mod lookups. Every id, slot path and
 * numeric value below is taken from the live json.tarkov.dev items document
 * (sampled 2026-08-19).
 *
 * The previous version claimed "real Tarkov item IDs" but the four it used
 * were a front sight, a receiver extension, an M-LOK rail, and one id absent
 * from upstream entirely — attached to `mod_barrel` / `mod_handguard` slots the
 * M4A1 does not have at top level. Its stat values were percent-scale too
 * (`recoilModifier: -22`, `accuracyModifier: 0.5` against a real max of 0.06),
 * which is the class of fixture that hid the unit error in
 * docs/operations/data-api-audit.md §B.
 */
export const m4a1Build: BuildV5 = {
  version: 5,
  weaponId: "5447a9cd4bdc2dbd208b4567", // Colt M4A1 5.56x45 assault rifle
  attachments: {
    mod_pistol_grip: "5a33e75ac4a2826c6e06d759",
    mod_stock: "5947e98b86f774778f1448bc",
    mod_reciever: "59bfe68886f7746004266202",
  },
  orphaned: [],
  createdAt: "2026-04-21T00:00:00.000Z",
  name: "RECOIL KING",
  description: "",
};

export interface FixtureWeapon {
  id: string;
  shortName: string;
  properties: {
    ergonomics: number;
    recoilVertical: number;
    recoilHorizontal: number;
  } | null;
}

export interface FixtureMod {
  id: string;
  shortName: string;
  weight: number;
  buyFor: { priceRUB: number }[];
  properties: {
    ergonomics?: number;
    recoilModifier?: number;
    accuracyModifier?: number;
  } | null;
}

export const m4a1Weapon: FixtureWeapon = {
  id: "5447a9cd4bdc2dbd208b4567",
  shortName: "M4A1",
  properties: { ergonomics: 48, recoilVertical: 119, recoilHorizontal: 342 },
};

// recoilModifier / accuracyModifier are fractions, exactly as upstream returns
// them. Attached sum is -0.495, i.e. a real -49.5% recoil build.
export const m4a1Mods: FixtureMod[] = [
  {
    id: "5a33e75ac4a2826c6e06d759",
    shortName: "CQR AR15",
    weight: 0.499,
    buyFor: [{ priceRUB: 12_000 }],
    properties: { ergonomics: 15, recoilModifier: -0.23, accuracyModifier: 0 },
  },
  {
    id: "5947e98b86f774778f1448bc",
    shortName: "UBR GEN2",
    weight: 0.61,
    buyFor: [{ priceRUB: 42_000 }],
    properties: { ergonomics: 8, recoilModifier: -0.225, accuracyModifier: 0 },
  },
  {
    id: "59bfe68886f7746004266202",
    shortName: "MUR-1S",
    weight: 0.246,
    buyFor: [{ priceRUB: 36_000 }],
    properties: { ergonomics: 7, recoilModifier: -0.04, accuracyModifier: 0 },
  },
];
