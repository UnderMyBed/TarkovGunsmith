import { describe, expect, it } from "vitest";
import { fetchArmorList } from "./armorList.js";
import { fixtureClient } from "../__fixtures__/client.js";
import fixture from "../__fixtures__/items-sample.json" with { type: "json" };

describe("fetchArmorList", () => {
  it("returns armor with class, durability and zones", async () => {
    const list = await fetchArmorList(fixtureClient());
    expect(list.length).toBeGreaterThan(0);
    for (const armor of list) {
      expect(typeof armor.properties.class).toBe("number");
      expect(typeof armor.properties.durability).toBe("number");
      expect(Array.isArray(armor.properties.zones)).toBe(true);
    }
  });

  it("resolves the bare material id into the frozen { name, destructibility } shape", async () => {
    const list = await fetchArmorList(fixtureClient());
    for (const armor of list) {
      expect(typeof armor.properties.material.name).toBe("string");
      expect(typeof armor.properties.material.destructibility).toBe("number");
      // The id is the human-readable value the GraphQL API exposed as `name`;
      // upstream's own `name` field is a game constant like "MatAramid".
      expect(armor.properties.material.name).not.toMatch(/^Mat/);
    }
  });

  it("drops every non-armor type, including helmets", async () => {
    const list = await fetchArmorList(fixtureClient());
    const ids = new Set(list.map((a) => a.id));
    const rejected = Object.values(fixture.document.data.items).filter(
      (i) => i.properties?.propertiesType !== "ItemPropertiesArmor",
    );
    expect(rejected.length).toBeGreaterThan(0);
    for (const item of rejected) expect(ids.has(item.id)).toBe(false);
  });

  it("resolves translated names", async () => {
    const list = await fetchArmorList(fixtureClient());
    for (const armor of list) expect(armor.name).not.toMatch(/ Name$/);
  });
});
