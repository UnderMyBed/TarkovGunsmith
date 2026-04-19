import { describe, expect, it } from "vitest";
import { adaptAmmo, adaptArmor } from "./adapters.js";
import type { AmmoListItem, ArmorListItem } from "@tarkov/data";

const sampleAmmoListItem: AmmoListItem = {
  id: "ammo-1",
  name: "5.45x39mm BP gs",
  shortName: "BP",
  iconLink: "https://assets.tarkov.dev/ammo-1-icon.webp",
  properties: {
    __typename: "ItemPropertiesAmmo",
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
    __typename: "ItemPropertiesArmor",
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
