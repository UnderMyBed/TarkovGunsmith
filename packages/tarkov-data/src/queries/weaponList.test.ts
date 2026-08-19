import { describe, expect, it } from "vitest";
import { fetchWeaponList } from "./weaponList.js";
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
