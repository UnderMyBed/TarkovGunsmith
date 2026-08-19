import { describe, expect, it } from "vitest";
import { adaptAmmo, adaptArmor, adaptMod, adaptWeapon } from "./adapters.js";
import type { AmmoListItem, ArmorListItem, ModListItem, WeaponListItem } from "@tarkov/data";

const sampleAmmoListItem: AmmoListItem = {
  id: "ammo-1",
  name: "5.45x39mm BP gs",
  shortName: "BP",
  iconLink: "https://assets.tarkov.dev/ammo-1-icon.webp",
  properties: {
    propertiesType: "ItemPropertiesAmmo",
    caliber: "Caliber545x39",
    penetrationPower: 45,
    damage: 48,
    armorDamage: 46,
    projectileCount: 1,
  },
};

const sampleArmorListItem: ArmorListItem = {
  id: "armor-1",
  name: "Kord Defender-2 (Class 4)",
  shortName: "Kord",
  iconLink: "https://assets.tarkov.dev/armor-1-icon.webp",
  properties: {
    propertiesType: "ItemPropertiesArmor",
    class: 4,
    durability: 60,
    material: { name: "UHMWPE", destructibility: 0.5 },
    zones: ["Chest", "Stomach"],
  },
};

describe("adaptAmmo", () => {
  it("maps tarkov-data AmmoListItem to ballistics BallisticAmmo", () => {
    const out = adaptAmmo(sampleAmmoListItem);
    expect(out.id).toBe("ammo-1");
    expect(out.name).toBe("5.45x39mm BP gs");
    expect(out.penetrationPower).toBe(45);
    expect(out.damage).toBe(48);
    expect(out.armorDamagePercent).toBe(46);
    expect(out.projectileCount).toBe(1);
  });

  it("renames properties.armorDamage → armorDamagePercent", () => {
    const out = adaptAmmo(sampleAmmoListItem);
    expect(out).not.toHaveProperty("armorDamage");
    expect(out).toHaveProperty("armorDamagePercent");
  });
});

describe("adaptArmor", () => {
  it("maps tarkov-data ArmorListItem to ballistics BallisticArmor", () => {
    const out = adaptArmor(sampleArmorListItem);
    expect(out.id).toBe("armor-1");
    expect(out.name).toBe("Kord Defender-2 (Class 4)");
    expect(out.armorClass).toBe(4);
    expect(out.maxDurability).toBe(60);
    expect(out.currentDurability).toBe(60);
    expect(out.materialDestructibility).toBe(0.5);
    expect(out.zones).toEqual(["Chest", "Stomach"]);
  });

  it("defaults currentDurability to maxDurability (fresh armor assumption)", () => {
    const out = adaptArmor(sampleArmorListItem);
    expect(out.currentDurability).toBe(out.maxDurability);
  });

  it("renames properties.class → armorClass and properties.durability → maxDurability", () => {
    const out = adaptArmor(sampleArmorListItem);
    expect(out).toHaveProperty("armorClass");
    expect(out).toHaveProperty("maxDurability");
    expect(out).not.toHaveProperty("class");
    expect(out).not.toHaveProperty("durability");
  });
});

// Colt M4A1 5.56x45 assault rifle, as the live document returns it.
const sampleWeaponListItem: WeaponListItem = {
  id: "5447a9cd4bdc2dbd208b4567",
  name: "Colt M4A1 5.56x45 assault rifle",
  shortName: "M4A1",
  iconLink: "https://assets.tarkov.dev/weapon-1-icon.webp",
  weight: 0.75,
  properties: {
    propertiesType: "ItemPropertiesWeapon",
    caliber: "Caliber556x45NATO",
    ergonomics: 48,
    recoilVertical: 119,
    recoilHorizontal: 342,
    fireRate: 800,
  },
};

// AR-15 Vendetta Precision VP-09 Interceptor 5.56x45 muzzle brake, as the live
// document returns it. `recoilModifier` is a fraction and `accuracyModifier` is
// a fraction where positive means better — the previous fixture asserted -15
// and -0.5, magnitudes 43x and 8x beyond anything upstream can return, which is
// why nothing here caught the 100x unit error.
const sampleModListItem: ModListItem = {
  id: "5a7c147ce899ef00150bd8b8",
  name: "AR-15 Vendetta Precision VP-09 Interceptor 5.56x45 muzzle brake",
  shortName: "VP-09",
  iconLink: "https://assets.tarkov.dev/mod-1-icon.webp",
  weight: 0.2,
  properties: {
    propertiesType: "ItemPropertiesWeaponMod",
    ergonomics: -2,
    recoilModifier: -0.085,
    accuracyModifier: 0.04,
  },
};

describe("adaptWeapon", () => {
  it("maps WeaponListItem to BallisticWeapon", () => {
    const out = adaptWeapon(sampleWeaponListItem);
    expect(out.id).toBe("5447a9cd4bdc2dbd208b4567");
    expect(out.name).toBe("Colt M4A1 5.56x45 assault rifle");
    expect(out.baseErgonomics).toBe(48);
    expect(out.baseVerticalRecoil).toBe(119);
    expect(out.baseHorizontalRecoil).toBe(342);
    expect(out.baseWeight).toBe(0.75);
  });

  it("defaults baseAccuracy to a reasonable value (upstream schema doesn't expose it)", () => {
    const out = adaptWeapon(sampleWeaponListItem);
    expect(out.baseAccuracy).toBeGreaterThan(0);
    expect(out.baseAccuracy).toBeLessThan(10);
  });
});

describe("adaptMod", () => {
  it("maps ModListItem to BallisticMod", () => {
    const out = adaptMod(sampleModListItem);
    expect(out.id).toBe("5a7c147ce899ef00150bd8b8");
    expect(out.name).toBe("AR-15 Vendetta Precision VP-09 Interceptor 5.56x45 muzzle brake");
    expect(out.ergonomicsDelta).toBe(-2);
    expect(out.weight).toBe(0.2);
  });

  it("passes recoil and accuracy through in upstream's fractional unit", () => {
    const out = adaptMod(sampleModListItem);
    // No scaling, in either direction. -0.085 is -8.5%; display sites multiply
    // by 100, the model never does. See docs/operations/data-api-audit.md §B.
    expect(out.recoilModifier).toBe(sampleModListItem.properties.recoilModifier);
    expect(out.accuracyModifier).toBe(sampleModListItem.properties.accuracyModifier);
    expect(out.recoilModifier).toBeGreaterThanOrEqual(-0.35);
    expect(out.recoilModifier).toBeLessThanOrEqual(0);
  });
});
