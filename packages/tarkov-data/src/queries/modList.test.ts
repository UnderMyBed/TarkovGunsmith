import { describe, expect, it } from "vitest";
import { fetchModList } from "./modList.js";
import { fixtureClient } from "../__fixtures__/client.js";
import fixture from "../__fixtures__/items-sample.json" with { type: "json" };

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
});
