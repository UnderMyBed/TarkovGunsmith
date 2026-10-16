import { describe, expect, it } from "vitest";
import { fetchWeaponList, isBuildableWeapon } from "./weaponList.js";
import { fixtureClient } from "../__fixtures__/client.js";
import type { TarkovJsonClient } from "../client.js";

describe("fetchWeaponList", () => {
  it("returns guns with caliber, ergonomics and recoil", async () => {
    const list = await fetchWeaponList(fixtureClient());
    expect(list.length).toBeGreaterThan(0);
    for (const w of list) {
      expect(w.properties.propertiesType).toBe("ItemPropertiesWeapon");
      expect(typeof w.properties.caliber).toBe("string");
      expect(typeof w.properties.ergonomics).toBe("number");
      expect(typeof w.properties.recoilVertical).toBe("number");
    }
  });

  it("populates buyFor with resolved vendors", async () => {
    const list = await fetchWeaponList(fixtureClient());
    for (const w of list) {
      expect(Array.isArray(w.buyFor)).toBe(true);
      for (const entry of w.buyFor) expect(entry.vendor.normalizedName).not.toBe("");
    }
  });

  it("resolves translated names", async () => {
    const list = await fetchWeaponList(fixtureClient());
    for (const w of list) expect(w.name).not.toMatch(/ Name$/);
  });

  it("does not log when every item in the document is already valid weapons", async () => {
    const onlyWeapons = await fetchWeaponList(fixtureClient());
    const base = fixtureClient();
    const onlyWeaponsClient: TarkovJsonClient = {
      fetchResource: <T>(resource: string): Promise<T> => {
        if (resource === "items") {
          return Promise.resolve({
            items: Object.fromEntries(onlyWeapons.map((w) => [w.id, w])),
          } as T);
        }
        return base.fetchResource<T>(resource);
      },
    };
    const list = await fetchWeaponList(onlyWeaponsClient);
    expect(list.length).toBe(onlyWeapons.length);
  });
});

describe("fetchWeaponList — special-slot items", () => {
  it("drops the SP-81 signal pistol and RSP-30 cartridges, which upstream types as weapons", async () => {
    const ids = (await fetchWeaponList(fixtureClient())).map((w) => w.id);
    expect(ids).not.toContain("620109578d82e67e7911abf2"); // ZiD SP-81 26x75 signal pistol
    expect(ids).not.toContain("62178c4d4ecf221597654e3d"); // RSP-30 reactive signal cartridge (Red)
    expect(ids).toEqual(
      expect.arrayContaining(["5447a9cd4bdc2dbd208b4567", "5448bd6b4bdc2dfc2f8b4569"]),
    );
  });

  it("decides buildability by the specialSlot type flag", () => {
    expect(isBuildableWeapon({ types: ["gun", "noFlea", "specialSlot"] })).toBe(false);
    expect(isBuildableWeapon({ types: ["gun", "wearable"] })).toBe(true);
  });
});
