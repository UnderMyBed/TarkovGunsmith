import type { BuildV4 } from "@tarkov/data";

/**
 * Hand-constructed BuildV4 + weapon/mod lookups. IDs are real Tarkov item IDs;
 * numeric values are representative but not guaranteed to match live data.
 */
export const m4a1Build: BuildV4 = {
  version: 4,
  weaponId: "5447a9cd4bdc2dbd208b4567", // M4A1
  attachments: {
    mod_pistol_grip: "55d4af3a4bdc2d972f8b456f",
    mod_stock: "5c793fc42e221600114ca25d",
    mod_barrel: "5b7be4895acfc400170e2dd5",
    mod_handguard: "5c9a1c3a2e221602b21d3533",
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
  properties: { ergonomics: 48, recoilVertical: 120, recoilHorizontal: 344 },
};

export const m4a1Mods: FixtureMod[] = [
  {
    id: "55d4af3a4bdc2d972f8b456f",
    shortName: "ERGO",
    weight: 0.07,
    buyFor: [{ priceRUB: 12_000 }],
    properties: { ergonomics: 6, recoilModifier: -3 },
  },
  {
    id: "5c793fc42e221600114ca25d",
    shortName: "STOCK",
    weight: 0.32,
    buyFor: [{ priceRUB: 42_000 }],
    properties: { ergonomics: -4, recoilModifier: -22 },
  },
  {
    id: "5b7be4895acfc400170e2dd5",
    shortName: "BARREL",
    weight: 0.61,
    buyFor: [{ priceRUB: 36_000 }],
    properties: { recoilModifier: -9, accuracyModifier: 0.5 },
  },
  {
    id: "5c9a1c3a2e221602b21d3533",
    shortName: "HG",
    weight: 0.4,
    buyFor: [{ priceRUB: 28_000 }],
    properties: { ergonomics: 10, recoilModifier: -7 },
  },
];
