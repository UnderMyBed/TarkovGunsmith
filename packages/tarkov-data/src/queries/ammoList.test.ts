import { describe, expect, it } from "vitest";
import { fetchAmmoList } from "./ammoList.js";
import type { TarkovJsonClient } from "../client.js";
import { mergeTranslations } from "../translations.js";
import fixture from "../__fixtures__/items-sample.json" with { type: "json" };

/** A client that serves the committed items fixture, translations already merged. */
export function fixtureClient(): TarkovJsonClient {
  return {
    fetchResource: <T>(): Promise<T> =>
      Promise.resolve(
        mergeTranslations(
          structuredClone(fixture.document) as never,
          fixture.lang as Record<string, string>,
        ),
      ),
  };
}

describe("fetchAmmoList", () => {
  it("returns only ItemPropertiesAmmo items", async () => {
    const list = await fetchAmmoList(fixtureClient());
    expect(list.length).toBeGreaterThan(0);
    for (const ammo of list) {
      expect(ammo.properties.propertiesType).toBe("ItemPropertiesAmmo");
      expect(typeof ammo.properties.penetrationPower).toBe("number");
      expect(typeof ammo.properties.caliber).toBe("string");
    }
  });

  it("drops grenades and every other non-ammo type", async () => {
    const list = await fetchAmmoList(fixtureClient());
    const ids = new Set(list.map((a) => a.id));
    const rejected = Object.values(fixture.document.data.items).filter(
      (i) => i.properties?.propertiesType !== "ItemPropertiesAmmo",
    );
    expect(rejected.length).toBeGreaterThan(0);
    for (const item of rejected) expect(ids.has(item.id)).toBe(false);
  });

  it("resolves translated names rather than translation keys", async () => {
    const list = await fetchAmmoList(fixtureClient());
    for (const ammo of list) {
      expect(ammo.name).not.toMatch(/ Name$/);
      expect(ammo.shortName).not.toMatch(/ ShortName$/);
    }
  });
});
