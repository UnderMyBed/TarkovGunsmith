import { describe, expect, it } from "vitest";
import {
  fetchPartCatalog,
  isModLikePart,
  parseAttachablePart,
  partsById,
  selectPartCatalog,
} from "./parts.js";
import { adaptMod } from "../ballistic-adapters.js";
import { fixtureClient } from "../__fixtures__/client.js";
import type { ItemsDocument } from "./documents.js";

const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
const HAMR_SCOPE = "544a3a774bdc2d3a388b4567";
const STANAG_MAG = "55d4887d4bdc2d962f8b4570";
const M855A1 = "54527ac44bdc2d36668b4567";

async function itemsDoc(): Promise<ItemsDocument> {
  return fixtureClient().fetchResource<ItemsDocument>("items");
}

describe("selectPartCatalog", () => {
  it("covers every slot-attachable type: mods, barrels, scopes, magazines, ammo", async () => {
    const parts = await fetchPartCatalog(fixtureClient());
    const types = new Set(parts.map((p) => p.properties.propertiesType));
    expect([...types].sort()).toEqual([
      "ItemPropertiesAmmo",
      "ItemPropertiesBarrel",
      "ItemPropertiesMagazine",
      "ItemPropertiesScope",
      "ItemPropertiesWeaponMod",
    ]);
    const byId = partsById(parts);
    for (const id of [BARREL_10_3, HAMR_SCOPE, STANAG_MAG, M855A1]) expect(byId.has(id)).toBe(true);
  });

  it("rejects weapons, armor, helmets and grenades", async () => {
    const doc = await itemsDoc();
    const ids = new Set(selectPartCatalog(doc, () => []).map((p) => p.id));
    const rejected = Object.values(doc.items).filter((i) =>
      [
        "ItemPropertiesWeapon",
        "ItemPropertiesArmor",
        "ItemPropertiesHelmet",
        "ItemPropertiesGrenade",
      ].includes(
        (i as { properties?: { propertiesType?: string } }).properties?.propertiesType ?? "",
      ),
    );
    expect(rejected.length).toBeGreaterThan(0);
    for (const item of rejected) expect(ids.has((item as { id: string }).id)).toBe(false);
  });

  it("resolves every item id a weapon or weapon-part slot allows", async () => {
    // The point of #213: a slot option the catalog cannot resolve contributes nothing to
    // stats or price and reads as "missing" on a shared build. Gear slots (a helmet's face
    // shield mount) are out of scope, so only weapons and parts are owners here.
    const doc = await itemsDoc();
    const byId = partsById(selectPartCatalog(doc, () => []));
    const unresolved: string[] = [];
    for (const item of Object.values(doc.items)) {
      const props = (
        item as { id: string; properties?: { propertiesType?: string; slots?: unknown } }
      ).properties;
      const isOwner =
        props?.propertiesType === "ItemPropertiesWeapon" || byId.has((item as { id: string }).id);
      const slots = props?.slots;
      if (!isOwner || !Array.isArray(slots)) continue;
      for (const slot of slots as { filters?: { allowedItems?: string[] } }[]) {
        for (const id of slot.filters?.allowedItems ?? []) {
          if (id in doc.items && !byId.has(id)) unresolved.push(id);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("carries the real modifiers of a barrel, a scope and a magazine", async () => {
    const byId = partsById(await fetchPartCatalog(fixtureClient()));
    expect(adaptMod(byId.get(BARREL_10_3)!)).toMatchObject({
      ergonomicsDelta: -2,
      recoilModifier: -0.052000000000000005,
      weight: 0.409,
    });
    expect(adaptMod(byId.get(HAMR_SCOPE)!)).toMatchObject({ ergonomicsDelta: -3.5, weight: 0.411 });
    expect(adaptMod(byId.get(STANAG_MAG)!)).toMatchObject({ ergonomicsDelta: -1.5 });
  });

  it("gives ammo its weight and no stat modifiers, though upstream ships one", async () => {
    const doc = await itemsDoc();
    const raw = doc.items[M855A1] as { properties: { recoilModifier: number } };
    expect(raw.properties.recoilModifier).toBe(0.05);
    const part = partsById(selectPartCatalog(doc, () => [])).get(M855A1)!;
    expect(isModLikePart(part)).toBe(false);
    expect(adaptMod(part)).toEqual({
      id: M855A1,
      name: part.name,
      ergonomicsDelta: 0,
      recoilModifier: 0,
      accuracyModifier: 0,
      weight: 0.012,
    });
  });

  it("carries conflict lists and resolved offers", async () => {
    const parts = await fetchPartCatalog(fixtureClient());
    const barrel = partsById(parts).get(BARREL_10_3)!;
    expect(barrel.conflictingItems.length).toBe(3);
    expect(barrel.conflictingSlotIds).toEqual([]);
    expect(parts.some((p) => (p.buyFor ?? []).length > 0)).toBe(true);
    for (const p of parts) expect(p.name).not.toMatch(/ Name$/);
  });

  it("carries no craft or barter sourcing fields", async () => {
    // Crafting and barter sourcing live in upstream resources nothing here fetches, so a
    // part carries no such field at all; Zod strips them if upstream starts sending them.
    for (const part of await fetchPartCatalog(fixtureClient())) {
      expect(part).not.toHaveProperty("craftsFor");
      expect(part).not.toHaveProperty("bartersFor");
    }
  });
});

describe("parseAttachablePart", () => {
  it("parses one part and refuses anything else", async () => {
    const doc = await itemsDoc();
    expect(parseAttachablePart(doc.items[BARREL_10_3], () => [])?.properties.propertiesType).toBe(
      "ItemPropertiesBarrel",
    );
    expect(parseAttachablePart(doc.items["5447a9cd4bdc2dbd208b4567"], () => [])).toBeNull();
    expect(parseAttachablePart(undefined, () => [])).toBeNull();
  });
});
