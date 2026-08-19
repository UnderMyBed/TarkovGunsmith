import { describe, expect, it } from "vitest";
import { adaptWeapon, adaptMod, DEFAULT_BASE_ACCURACY } from "./ballistic-adapters.js";
import type { WeaponListItem } from "./queries/weaponList.js";
import type { ModListItem } from "./queries/modList.js";

/**
 * `adaptWeapon` / `adaptMod` are pure passthrough converters into
 * `@tarkov/ballistics`'s input shape — see the "why" comments on each in
 * `ballistic-adapters.ts`. These tests exist mainly to pin the field mapping
 * (especially the deliberate non-`default*` field reads on the weapon side)
 * so a future rename in `queries/weaponList.ts` / `queries/modList.ts` fails
 * loudly here instead of silently zeroing a stat on every card.
 */

function weaponListItem(overrides: Partial<WeaponListItem> = {}): WeaponListItem {
  return {
    id: "5447a9cd4bdc2dbd208b4567",
    name: "M4A1",
    shortName: "M4A1",
    iconLink: "https://assets.tarkov.dev/m4a1-icon.webp",
    weight: 3.6,
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
    ...overrides,
  };
}

function modListItem(overrides: Partial<ModListItem> = {}): ModListItem {
  return {
    id: "5a33e75ac4a2826c6e06d759",
    name: "CQR AR15",
    shortName: "CQR AR15",
    iconLink: "https://assets.tarkov.dev/cqr-icon.webp",
    weight: 0.499,
    types: ["mods"],
    minLevelForFlea: null,
    properties: {
      propertiesType: "ItemPropertiesWeaponMod",
      ergonomics: 15,
      recoilModifier: -0.23,
      accuracyModifier: 0,
    },
    buyFor: [],
    ...overrides,
  };
}

describe("adaptWeapon", () => {
  it("reads the bare-receiver ergonomics/recoil fields, not a default* variant", () => {
    const spec = adaptWeapon(weaponListItem());
    expect(spec).toEqual({
      id: "5447a9cd4bdc2dbd208b4567",
      name: "M4A1",
      baseErgonomics: 48,
      baseVerticalRecoil: 119,
      baseHorizontalRecoil: 342,
      baseWeight: 3.6,
      baseAccuracy: DEFAULT_BASE_ACCURACY,
    });
  });

  it("always stamps the fabricated DEFAULT_BASE_ACCURACY, since upstream has no real stat", () => {
    const spec = adaptWeapon(weaponListItem({ id: "other", name: "Other Gun" }));
    expect(spec.baseAccuracy).toBe(3.5);
  });
});

describe("adaptMod", () => {
  it("passes recoilModifier/accuracyModifier through unconverted (fractions, not percents)", () => {
    const spec = adaptMod(modListItem());
    expect(spec).toEqual({
      id: "5a33e75ac4a2826c6e06d759",
      name: "CQR AR15",
      ergonomicsDelta: 15,
      recoilModifier: -0.23,
      weight: 0.499,
      accuracyModifier: 0,
    });
  });

  it("carries a non-zero accuracyModifier through untouched", () => {
    const spec = adaptMod(
      modListItem({
        id: "compensator",
        properties: {
          propertiesType: "ItemPropertiesWeaponMod",
          ergonomics: -2,
          recoilModifier: -0.05,
          accuracyModifier: 0.02,
        },
      }),
    );
    expect(spec.accuracyModifier).toBe(0.02);
    expect(spec.ergonomicsDelta).toBe(-2);
  });
});
