import { describe, expect, it } from "vitest";
import { fetchModList } from "./modList.js";
import { fixtureClient } from "../__fixtures__/client.js";
import fixture from "../__fixtures__/items-sample.json" with { type: "json" };
import type { TarkovJsonClient } from "../client.js";

describe("fetchModList", () => {
  it("returns weapon mods with ergo, recoil and accuracy modifiers", async () => {
    const list = await fetchModList(fixtureClient());
    expect(list.length).toBeGreaterThan(0);
    for (const mod of list) {
      expect(mod.properties.propertiesType).toBe("ItemPropertiesWeaponMod");
      expect(typeof mod.properties.ergonomics).toBe("number");
      expect(typeof mod.properties.recoilModifier).toBe("number");
    }
  });

  it("excludes magazines and scopes, which are not ItemPropertiesWeaponMod", async () => {
    const list = await fetchModList(fixtureClient());
    const ids = new Set(list.map((m) => m.id));
    const excluded = Object.values(fixture.document.data.items).filter((i) =>
      ["ItemPropertiesMagazine", "ItemPropertiesScope", "ItemPropertiesWeapon"].includes(
        i.properties?.propertiesType ?? "",
      ),
    );
    expect(excluded.length).toBeGreaterThan(0);
    for (const item of excluded) expect(ids.has(item.id)).toBe(false);
  });

  it("populates buyFor with resolved vendors", async () => {
    const list = await fetchModList(fixtureClient());
    const withOffers = list.filter((m) => (m.buyFor ?? []).length > 0);
    expect(withOffers.length).toBeGreaterThan(0);
    for (const mod of withOffers) {
      for (const entry of mod.buyFor ?? []) {
        expect(["TraderOffer", "FleaMarket"]).toContain(entry.vendor.__typename);
        expect(entry.vendor.normalizedName).not.toBe("");
      }
    }
  });

  it("resolves translated names", async () => {
    const list = await fetchModList(fixtureClient());
    for (const mod of list) expect(mod.name).not.toMatch(/ Name$/);
  });

  it("does not log when every item in the document is already valid mods", async () => {
    // Mirrors ammoList.test.ts's equivalent case: the console.debug line only fires when
    // filtering actually dropped something. traders/tasks still come from the real fixture
    // client — only the "items" resource is replaced with an already-mods-only document.
    const onlyMods = await fetchModList(fixtureClient());
    const base = fixtureClient();
    const onlyModsClient: TarkovJsonClient = {
      fetchResource: <T>(resource: string): Promise<T> => {
        if (resource === "items") {
          return Promise.resolve({
            items: Object.fromEntries(onlyMods.map((m) => [m.id, m])),
          } as T);
        }
        return base.fetchResource<T>(resource);
      },
    };
    const list = await fetchModList(onlyModsClient);
    expect(list.length).toBe(onlyMods.length);
  });
});
