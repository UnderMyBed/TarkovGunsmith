import type { ModListItem, WeaponTree } from "@tarkov/data";
import type { BallisticWeapon } from "@tarkov/ballistics";

/**
 * Realistic-ish 8-slot rifle fixture for integration tests. Slot counts
 * and item counts per slot are tuned so the full search space is
 * tractable for hand-verification of the optimum while still exercising
 * pruning and nested recursion.
 */
export const M4A1_WEAPON: BallisticWeapon = {
  id: "m4a1",
  name: "M4A1",
  baseErgonomics: 47,
  baseVerticalRecoil: 56,
  baseHorizontalRecoil: 220,
  baseWeight: 3.1,
  baseAccuracy: 2.5,
};

export const M4A1_MODS: readonly ModListItem[] = [
  ...generateSlotMods("muzzle", 4, { recoilBase: -10, priceBase: 5000 }),
  ...generateSlotMods("barrel", 3, { recoilBase: -5, priceBase: 8000 }),
  ...generateSlotMods("handguard", 3, { recoilBase: 0, priceBase: 3000, ergonomicsBase: 10 }),
  ...generateSlotMods("foregrip", 3, { recoilBase: -8, priceBase: 2000 }),
  ...generateSlotMods("stock", 3, { recoilBase: -15, priceBase: 4000 }),
  ...generateSlotMods("pistolgrip", 3, { recoilBase: -3, priceBase: 1200, ergonomicsBase: 4 }),
  ...generateSlotMods("sight", 3, { recoilBase: 0, priceBase: 10000, ergonomicsBase: -2 }),
  ...generateSlotMods("mag", 2, { recoilBase: 0, priceBase: 500, weightBase: 0.2 }),
];

export const M4A1_TREE: WeaponTree = {
  weaponId: "m4a1",
  weaponName: "M4A1",
  slots: [
    slotWithOptions("muzzle", 4),
    slotWithOptions("barrel", 3),
    slotWithOptions("handguard", 3),
    slotWithOptions("foregrip", 3),
    slotWithOptions("stock", 3),
    slotWithOptions("pistolgrip", 3),
    slotWithOptions("sight", 3),
    slotWithOptions("mag", 2),
  ],
};

function generateSlotMods(
  slotName: string,
  count: number,
  base: {
    recoilBase: number;
    priceBase: number;
    ergonomicsBase?: number;
    weightBase?: number;
  },
): readonly ModListItem[] {
  const out: ModListItem[] = [];
  for (let i = 0; i < count; i++) {
    const recoilModifier = base.recoilBase - i;
    const ergonomics = (base.ergonomicsBase ?? 0) + i;
    const weight = (base.weightBase ?? 0.1) + i * 0.05;
    const accuracyModifier = 0;
    const priceRub = base.priceBase + i * 1500;
    out.push({
      id: `${slotName}_${i}`,
      name: `${slotName} v${i}`,
      shortName: `${slotName}${i}`,
      iconLink: `https://example.com/${slotName}_${i}.png`,
      weight,
      types: ["mods"],
      minLevelForFlea: null,
      properties: {
        __typename: "ItemPropertiesWeaponMod",
        ergonomics,
        recoilModifier,
        accuracyModifier,
      },
      buyFor: [
        {
          priceRUB: priceRub,
          currency: "RUB",
          vendor: {
            __typename: "FleaMarket",
            normalizedName: "flea-market",
            minPlayerLevel: 15,
          },
        },
      ],
    } as ModListItem);
  }
  return out;
}

function slotWithOptions(nameId: string, count: number) {
  const ids = Array.from({ length: count }, (_, i) => `${nameId}_${i}`);
  return {
    nameId,
    path: nameId,
    name: nameId,
    required: false,
    allowedItemIds: new Set(ids),
    allowedItems: ids.map((id) => ({ id, name: id, children: [] })),
    allowedCategories: [],
    children: [],
  };
}
