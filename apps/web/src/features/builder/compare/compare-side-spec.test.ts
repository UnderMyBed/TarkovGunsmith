// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { AttachablePart, BuildV6, WeaponListItem } from "@tarkov/data";
import { computeSideSpec } from "./compare-side.js";
import { tinyTree } from "../../../test/tiny-tree.js";

// Live values: the Colt M4A1 receiver, the AR-15 10.3" barrel, the Colt STANAG magazine.
const M4A1: WeaponListItem = {
  id: "5447a9cd4bdc2dbd208b4567",
  name: "Colt M4A1 5.56x45 assault rifle",
  shortName: "M4A1",
  iconLink: "https://assets.tarkov.dev/5447a9cd4bdc2dbd208b4567-icon.webp",
  weight: 2.7,
  types: ["gun"],
  velocity: 0,
  properties: {
    propertiesType: "ItemPropertiesWeapon",
    caliber: "Caliber556x45NATO",
    ergonomics: 48,
    recoilVertical: 119,
    recoilHorizontal: 342,
    fireRate: 800,
    centerOfImpact: 0.01,
    deviationCurve: 1.35,
    effectiveDistance: 500,
    sightingRange: 100,
  },
  defaultAmmo: { id: "54527a984bdc2d4e668b4567", shortName: "M855", initialSpeed: 922 },
  buyFor: [],
};

function part(
  id: string,
  weight: number,
  properties: AttachablePart["properties"],
): AttachablePart {
  return {
    id,
    name: id,
    shortName: id,
    iconLink: `https://assets.tarkov.dev/${id}-icon.webp`,
    weight,
    types: ["mods"],
    minLevelForFlea: 0,
    properties,
    buyFor: [],
    conflictingItems: [],
    conflictingSlotIds: [],
  };
}

const BARREL = part("55d35ee94bdc2d61338b4568", 0.409, {
  propertiesType: "ItemPropertiesBarrel",
  ergonomics: -2,
  recoilModifier: -0.052,
  accuracyModifier: 0,
  velocity: -11,
  centerOfImpact: 0.07,
  deviationMax: 22,
});
const MAG = part("55d4887d4bdc2d962f8b4570", 0.117, {
  propertiesType: "ItemPropertiesMagazine",
  ergonomics: -1.5,
  recoilModifier: 0,
  accuracyModifier: 0,
  velocity: 0,
  capacity: 30,
  loadModifier: 0,
  malfunctionChance: 0.08,
});

/** The M4A1 upper receiver, as captured. */
const UPPER_PART = part("55d355e64bdc2d962f8b4569", 0.27, {
  propertiesType: "ItemPropertiesWeaponMod",
  ergonomics: 5,
  recoilModifier: -0.01,
  accuracyModifier: 0,
  velocity: 0,
});

function build(attachments: Record<string, string>): BuildV6 {
  return { version: 6, weaponId: M4A1.id, attachments, orphaned: [], createdAt: "x" };
}

const UPPER = UPPER_PART.id;
const TREE = tinyTree(M4A1.id, [
  { nameId: "mod_reciever", items: [[UPPER, [{ nameId: "mod_barrel", items: [BARREL.id] }]]] },
  { nameId: "mod_magazine", items: [MAG.id] },
  { nameId: "a", items: [MAG.id] },
  { nameId: "b", items: [MAG.id] },
]);

describe("computeSideSpec", () => {
  it("counts barrels and magazines, which the WeaponMod-only list used to drop", () => {
    const spec = computeSideSpec(
      build({ mod_reciever: UPPER, "mod_reciever/mod_barrel": BARREL.id, mod_magazine: MAG.id }),
      TREE,
      [M4A1],
      [UPPER_PART, BARREL, MAG],
    );
    expect(spec?.ergonomics).toBeCloseTo(48 + 5 - 2 - 1.5, 10);
    expect(spec?.verticalRecoil).toBeCloseTo(119 * (1 - 0.052 - 0.01), 10);
    // The barrel sets the dispersion: (0.01 + 0.07) cm at 100/2.9089 MOA per cm.
    expect(spec?.accuracy).toBeCloseTo(2.750228, 5);
    expect(spec?.muzzleVelocity).toBeCloseTo(922 * 0.89, 6);
  });

  it("counts a part fitted in two slots twice", () => {
    const spec = computeSideSpec(build({ a: MAG.id, b: MAG.id }), TREE, [M4A1], [MAG]);
    expect(spec?.ergonomics).toBeCloseTo(48 - 3, 10);
    expect(spec?.weight).toBeCloseTo(2.7 + 0.234, 10);
  });

  it("leaves out a barrel whose receiver was removed", () => {
    const spec = computeSideSpec(
      build({ "mod_reciever/mod_barrel": BARREL.id }),
      TREE,
      [M4A1],
      [BARREL],
    );
    expect(spec?.ergonomics).toBe(48);
    expect(spec?.weight).toBeCloseTo(2.7, 10);
  });

  it("waits for the build's own tree", () => {
    expect(computeSideSpec(build({}), undefined, [M4A1], [])).toBeNull();
    expect(computeSideSpec(build({}), tinyTree("other", []), [M4A1], [])).toBeNull();
  });
});
