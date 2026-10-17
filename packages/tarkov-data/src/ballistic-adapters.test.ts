import { describe, expect, it } from "vitest";
import { adaptWeapon, adaptMod, mountedMagazine } from "./ballistic-adapters.js";
import type { WeaponListItem } from "./queries/weaponList.js";
import type { AttachablePart } from "./queries/parts.js";

/**
 * `adaptWeapon` / `adaptMod` are pure passthrough converters into
 * `@tarkov/ballistics`'s input shape — see the "why" comments on each in
 * `ballistic-adapters.ts`. These tests exist mainly to pin the field mapping
 * (especially the deliberate non-`default*` field reads on the weapon side)
 * so a future rename in `queries/weaponList.ts` / `queries/parts.ts` fails
 * loudly here instead of silently zeroing a stat on every card.
 *
 * Values are upstream's for the named ids (live document, 2026-10-17).
 */

function weaponListItem(overrides: Partial<WeaponListItem> = {}): WeaponListItem {
  return {
    id: "5447a9cd4bdc2dbd208b4567",
    name: "Colt M4A1 5.56x45 assault rifle",
    shortName: "M4A1",
    iconLink: "https://assets.tarkov.dev/5447a9cd4bdc2dbd208b4567-icon.webp",
    weight: 0.75,
    types: ["gun", "wearable"],
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
    ...overrides,
  };
}

const BASE_PART = {
  shortName: "part",
  iconLink: "https://assets.tarkov.dev/part-icon.webp",
  types: ["mods"],
  minLevelForFlea: null,
  buyFor: [],
  conflictingItems: [],
  conflictingSlotIds: [],
};

const CQR_GRIP: AttachablePart = {
  ...BASE_PART,
  id: "5a33e75ac4a2826c6e06d759",
  name: "CQR AR15",
  weight: 0.499,
  properties: {
    propertiesType: "ItemPropertiesWeaponMod",
    ergonomics: 15,
    recoilModifier: -0.23,
    accuracyModifier: 0,
    velocity: 0,
  },
};

const BARREL_10_3: AttachablePart = {
  ...BASE_PART,
  id: "55d35ee94bdc2d61338b4568",
  name: "AR-15 5.56x45 10.3 inch barrel",
  weight: 0.409,
  properties: {
    propertiesType: "ItemPropertiesBarrel",
    ergonomics: -2,
    recoilModifier: -0.052000000000000005,
    accuracyModifier: 0,
    velocity: -11,
    centerOfImpact: 0.07,
    deviationMax: 22,
  },
};

const HAMR_SCOPE: AttachablePart = {
  ...BASE_PART,
  id: "544a3a774bdc2d3a388b4567",
  name: "Leupold Mark 4 HAMR 4x24 DeltaPoint hybrid assault scope",
  weight: 0.411,
  properties: {
    propertiesType: "ItemPropertiesScope",
    ergonomics: -3.5,
    recoilModifier: 0,
    accuracyModifier: 0,
    velocity: 0,
    sightingRange: 800,
  },
};

const STANAG: AttachablePart = {
  ...BASE_PART,
  id: "55d4887d4bdc2d962f8b4570",
  name: "AR-15 5.56x45 Colt STANAG 30-round magazine",
  weight: 0.117,
  properties: {
    propertiesType: "ItemPropertiesMagazine",
    ergonomics: -1.5,
    recoilModifier: 0,
    accuracyModifier: 0,
    velocity: 0,
    capacity: 30,
    loadModifier: 0,
    malfunctionChance: 0.08,
  },
};

describe("adaptWeapon", () => {
  it("reads the bare-receiver stats and passes every other field through in upstream's unit", () => {
    expect(adaptWeapon(weaponListItem())).toEqual({
      id: "5447a9cd4bdc2dbd208b4567",
      name: "Colt M4A1 5.56x45 assault rifle",
      baseErgonomics: 48,
      baseVerticalRecoil: 119,
      baseHorizontalRecoil: 342,
      baseWeight: 0.75,
      centerOfImpact: 0.01,
      deviationCurve: 1.35,
      velocity: 0,
      fireRate: 800,
      effectiveDistance: 500,
      sightingRange: 100,
      defaultAmmo: { name: "M855", initialSpeed: 922 },
    });
  });

  it("has no default ammo when upstream publishes none to resolve", () => {
    expect(adaptWeapon(weaponListItem({ defaultAmmo: null })).defaultAmmo).toBeNull();
  });
});

describe("adaptMod", () => {
  it("passes recoilModifier/accuracyModifier through unconverted (fractions, not percents)", () => {
    expect(adaptMod(CQR_GRIP)).toEqual({
      id: "5a33e75ac4a2826c6e06d759",
      name: "CQR AR15",
      ergonomicsDelta: 15,
      recoilModifier: -0.23,
      weight: 0.499,
      accuracyModifier: 0,
      centerOfImpact: 0,
      deviationMax: null,
      velocity: 0,
      sightingRange: null,
    });
  });

  it("carries a barrel's dispersion and its velocity percent", () => {
    expect(adaptMod(BARREL_10_3)).toMatchObject({
      centerOfImpact: 0.07,
      deviationMax: 22,
      velocity: -11,
      sightingRange: null,
    });
  });

  it("carries a sight's sighting range and no dispersion", () => {
    expect(adaptMod(HAMR_SCOPE)).toMatchObject({
      centerOfImpact: 0,
      deviationMax: null,
      sightingRange: 800,
    });
  });
});

describe("mountedMagazine", () => {
  it("reads the magazine in the weapon's own magazine slot", () => {
    expect(
      mountedMagazine([
        { path: "mod_pistol_grip", part: CQR_GRIP },
        { path: "mod_magazine", part: STANAG },
      ]),
    ).toEqual({
      id: "55d4887d4bdc2d962f8b4570",
      name: "AR-15 5.56x45 Colt STANAG 30-round magazine",
      capacity: 30,
      loadModifier: 0,
      malfunctionChance: 0.08,
    });
  });

  it("is null with the magazine slot empty or absent", () => {
    expect(mountedMagazine([{ path: "mod_pistol_grip", part: CQR_GRIP }])).toBeNull();
    expect(mountedMagazine([])).toBeNull();
  });

  it("reads only a magazine, and only from the weapon's own magazine slot", () => {
    expect(mountedMagazine([{ path: "mod_launcher/mod_magazine", part: STANAG }])).toBeNull();
    expect(mountedMagazine([{ path: "mod_magazine", part: CQR_GRIP }])).toBeNull();
  });
});
