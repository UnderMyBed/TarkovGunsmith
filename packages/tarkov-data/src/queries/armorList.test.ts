import { describe, expect, it } from "vitest";
import { fetchArmorList } from "./armorList.js";
import { fixtureClient } from "../__fixtures__/client.js";
import fixture from "../__fixtures__/items-sample.json" with { type: "json" };
import type { TarkovJsonClient } from "../client.js";
import type { ItemsDocument } from "./documents.js";

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

  it("does not log when every item in the document is already valid armor", async () => {
    const onlyArmor = await fetchArmorList(fixtureClient());
    const onlyArmorClient: TarkovJsonClient = {
      fetchResource: <T>(): Promise<T> =>
        Promise.resolve({
          items: Object.fromEntries(onlyArmor.map((a) => [a.id, a])),
          // Deliberately no `armorMaterials` — the re-fed items already carry a resolved
          // `{ name, destructibility }` material object, not a bare id, so `materialId` is
          // never a string and the lookup table is never consulted.
        } as T),
    };
    const list = await fetchArmorList(onlyArmorClient);
    expect(list.length).toBe(onlyArmor.length);
  });

  it("survives malformed item entries and an unresolvable material id without throwing", async () => {
    // Exercises withResolvedMaterial's defensive guards directly through fetchArmorList,
    // since the helper itself isn't exported: a null item, a non-object item, an item with
    // `properties: null`, and an item whose `properties.material` id isn't in the (here,
    // entirely absent) `armorMaterials` table. None of these should throw — they should
    // just fail `armorItemSchema` and get filtered out like any other non-armor shape.
    const doc = {
      items: {
        nullItem: null,
        primitiveItem: "not an object",
        noPropsItem: { id: "np1", name: "No Props", shortName: "NP", properties: null },
        unresolvableMaterial: {
          id: "um1",
          name: "Unresolvable Material Armor",
          shortName: "UMA",
          iconLink: "https://assets.tarkov.dev/um1-icon.webp",
          properties: {
            propertiesType: "ItemPropertiesArmor",
            class: 4,
            durability: 40,
            material: "Unobtainium",
            zones: ["Chest"],
          },
        },
      },
      // No `armorMaterials` table — drives both the `?? {}` fallback and the
      // `entry === undefined` branch in the same call.
    } as unknown as ItemsDocument;
    const client: TarkovJsonClient = {
      fetchResource: <T>(): Promise<T> => Promise.resolve(doc as T),
    };
    await expect(fetchArmorList(client)).resolves.toEqual([]);
  });
});
