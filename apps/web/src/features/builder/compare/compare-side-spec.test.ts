// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { AttachablePart, BuildV6, WeaponListItem } from "@tarkov/data";
import { computeSideSpec } from "./compare-side.js";

// Live values: the Colt M4A1 receiver, the AR-15 10.3" barrel, the Colt STANAG magazine.
const M4A1: WeaponListItem = {
  id: "5447a9cd4bdc2dbd208b4567",
  name: "Colt M4A1 5.56x45 assault rifle",
  shortName: "M4A1",
  iconLink: "https://assets.tarkov.dev/5447a9cd4bdc2dbd208b4567-icon.webp",
  weight: 2.7,
  types: ["gun"],
  properties: {
    propertiesType: "ItemPropertiesWeapon",
    caliber: "Caliber556x45NATO",
    ergonomics: 48,
    recoilVertical: 119,
    recoilHorizontal: 342,
    fireRate: 800,
  },
  buyFor: [],
};

function part(
  id: string,
  propertiesType: "ItemPropertiesBarrel" | "ItemPropertiesMagazine",
  ergonomics: number,
  recoilModifier: number,
  weight: number,
): AttachablePart {
  return {
    id,
    name: id,
    shortName: id,
    iconLink: `https://assets.tarkov.dev/${id}-icon.webp`,
    weight,
    types: ["mods"],
    minLevelForFlea: 0,
    properties: { propertiesType, ergonomics, recoilModifier, accuracyModifier: 0 },
    buyFor: [],
    conflictingItems: [],
    conflictingSlotIds: [],
  };
}

const BARREL = part("55d35ee94bdc2d61338b4568", "ItemPropertiesBarrel", -2, -0.052, 0.409);
const MAG = part("55d4887d4bdc2d962f8b4570", "ItemPropertiesMagazine", -1.5, 0, 0.117);

function build(attachments: Record<string, string>): BuildV6 {
  return { version: 6, weaponId: M4A1.id, attachments, orphaned: [], createdAt: "x" };
}

describe("computeSideSpec", () => {
  it("counts barrels and magazines, which the WeaponMod-only list used to drop", () => {
    const spec = computeSideSpec(
      build({ "mod_reciever/mod_barrel": BARREL.id, mod_magazine: MAG.id }),
      [M4A1],
      [BARREL, MAG],
    );
    expect(spec?.ergonomics).toBeCloseTo(48 - 2 - 1.5, 10);
    expect(spec?.verticalRecoil).toBeCloseTo(119 * (1 - 0.052), 10);
  });

  it("counts a part fitted in two slots twice", () => {
    const spec = computeSideSpec(build({ a: MAG.id, b: MAG.id }), [M4A1], [MAG]);
    expect(spec?.ergonomics).toBeCloseTo(48 - 3, 10);
    expect(spec?.weight).toBeCloseTo(2.7 + 0.234, 10);
  });
});
