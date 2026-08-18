import { describe, expect, it } from "vitest";
import { fetchWeapon, weaponSchema } from "./weapon.js";
import { fetchWeaponList } from "./weaponList.js";
import { fixtureClient } from "../__fixtures__/client.js";

const validItem = {
  id: "5447a9cd4bdc2dbd208b4567",
  name: "M4A1",
  shortName: "M4A1",
  iconLink: "https://assets.tarkov.dev/x-icon.webp",
  weight: 3.1,
  properties: {
    propertiesType: "ItemPropertiesWeapon",
    ergonomics: 50,
    recoilVertical: 70,
    recoilHorizontal: 250,
    caliber: "Caliber556x45NATO",
    fireRate: 800,
  },
};

describe("weaponSchema", () => {
  it("accepts a well-formed weapon", () => {
    expect(weaponSchema.safeParse({ item: validItem }).success).toBe(true);
  });

  it("rejects responses where item is null", () => {
    expect(weaponSchema.safeParse({ item: null }).success).toBe(false);
  });

  it("rejects items with non-numeric ergonomics", () => {
    const bad = { ...validItem, properties: { ...validItem.properties, ergonomics: "fast" } };
    expect(weaponSchema.safeParse({ item: bad }).success).toBe(false);
  });
});

describe("fetchWeapon", () => {
  it("returns the weapon for a known id", async () => {
    const list = await fetchWeaponList(fixtureClient());
    const found = await fetchWeapon(fixtureClient(), list[0]!.id);
    expect(found.id).toBe(list[0]!.id);
    expect(found.properties.propertiesType).toBe("ItemPropertiesWeapon");
  });

  it("throws for an unknown id rather than returning a partial object", async () => {
    await expect(fetchWeapon(fixtureClient(), "no-such-id")).rejects.toThrow();
  });
});
