import type { AttachablePart, AvailabilityInput, WeaponTree } from "@tarkov/data";
import type { BallisticWeapon } from "@tarkov/ballistics";
import { tinyTree } from "./tree.js";

/**
 * Toy 3-slot weapon used by unit tests. The numbers are chosen so
 * the optimal min-recoil build is hand-computable.
 *
 * Slots:
 *   - muzzle (2 options: brake, silencer)
 *   - grip   (1 option:  vertical)
 *   - stock  (1 option:  standard)
 *
 * Min-recoil optimum under no budget: brake + vertical + standard.
 * Recoil scoring: verticalRecoil + horizontalRecoil (after multiplier).
 *
 * `recoilModifier` values are fractions, matching upstream's own unit and live
 * range (-0.35..0). They were percent-scale here until the unit fix in
 * docs/operations/data-api-audit.md §B; magnitudes that cannot occur upstream
 * are exactly how that bug stayed invisible, so keep these plausible.
 */
export const SMALL_WEAPON: BallisticWeapon = {
  id: "weap1",
  name: "Test Rifle",
  baseErgonomics: 50,
  baseVerticalRecoil: 100,
  baseHorizontalRecoil: 200,
  baseWeight: 3.0,
  baseAccuracy: 3.0,
};

/**
 * The weapon's own record: Prapor sells the bare receiver at LL1. Budgets cover the whole
 * build, so this price is part of every budget test's arithmetic.
 */
export const SMALL_WEAPON_PRICE = 10_000;
export const SMALL_WEAPON_ITEM: AvailabilityInput & { shortName: string } = {
  shortName: "TR",
  types: ["gun"],
  buyFor: [
    {
      priceRUB: SMALL_WEAPON_PRICE,
      currency: "RUB",
      vendor: {
        __typename: "TraderOffer",
        normalizedName: "prapor",
        minTraderLevel: 1,
        taskUnlock: null,
        trader: { normalizedName: "prapor" },
      },
    },
  ],
};

export const SMALL_MODS: readonly AttachablePart[] = [
  makeMod("muzzle_brake", "Brake", -0.12, 2, 0.3, 1500),
  makeMod("muzzle_silencer", "Silencer", -0.08, 3, 0.5, 3500),
  makeMod("grip_vertical", "Vertical grip", -0.04, 5, 0.15, 900),
  makeMod("stock_standard", "Standard stock", -0.06, 8, 0.4, 2200),
];

export const SMALL_TREE: WeaponTree = {
  ...tinyTree("weap1", [
    { nameId: "muzzle", items: ["muzzle_brake", "muzzle_silencer"] },
    { nameId: "grip", items: ["grip_vertical"] },
    { nameId: "stock", items: ["stock_standard"] },
  ]),
  weaponName: "Test Rifle",
};

function makeMod(
  id: string,
  name: string,
  recoilModifier: number,
  ergonomics: number,
  weight: number,
  priceRub: number,
): AttachablePart {
  return {
    id,
    name,
    shortName: name,
    iconLink: `https://example.com/${id}.png`,
    weight,
    types: ["mods"],
    minLevelForFlea: null,
    properties: {
      propertiesType: "ItemPropertiesWeaponMod",
      ergonomics,
      recoilModifier,
      accuracyModifier: 0,
    },
    conflictingItems: [],
    conflictingSlotIds: [],
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
  };
}
