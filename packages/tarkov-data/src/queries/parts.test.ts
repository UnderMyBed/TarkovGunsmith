import { describe, expect, it } from "vitest";
import { isModLikePart, partsById, snapshotPartSchema, type AttachablePart } from "./parts.js";
import { adaptMod } from "../ballistic-adapters.js";
import { buildSlotGraph } from "./slot-graph.js";
import { fixtureClient } from "../__fixtures__/client.js";
import { fixturePartCatalog } from "../__test-utils__/fixture-snapshot.js";
import type { ItemsDocument } from "./documents.js";

const BARREL_10_3 = "55d35ee94bdc2d61338b4568";
const HAMR_SCOPE = "544a3a774bdc2d3a388b4567";
const STANAG_MAG = "55d4887d4bdc2d962f8b4570";
const M855A1 = "54527ac44bdc2d36668b4567";

async function itemsDoc(): Promise<ItemsDocument> {
  return fixtureClient().fetchResource<ItemsDocument>("items");
}

describe("the Builder part catalog", () => {
  it("covers the slot-attachable types the captured weapons reach", async () => {
    // The captures hold no revolver, so no cylinder slot reaches a cartridge: ammo is a part
    // type (see the next test) but not a reachable one here.
    const parts = await fixturePartCatalog();
    const types = new Set(parts.map((p) => p.properties.propertiesType));
    expect([...types].sort()).toEqual([
      "ItemPropertiesBarrel",
      "ItemPropertiesMagazine",
      "ItemPropertiesScope",
      "ItemPropertiesWeaponMod",
    ]);
    const byId = partsById(parts);
    for (const id of [BARREL_10_3, HAMR_SCOPE, STANAG_MAG]) expect(byId.has(id)).toBe(true);
  });

  it("rejects weapons, armor, helmets and grenades", async () => {
    const doc = await itemsDoc();
    const ids = new Set((await fixturePartCatalog()).map((p) => p.id));
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

  it("resolves every item reachable through slots from a weapon", async () => {
    // The point of #213: a slot option the catalog cannot resolve contributes nothing to
    // stats or price and reads as "missing" on a shared build. Walked from the weapons, since
    // gear has slots too (a helmet's face-shield mount) and those are not weapon parts.
    const doc = await itemsDoc();
    const byId = partsById(await fixturePartCatalog());
    const graph = buildSlotGraph(doc);
    const stack = Object.keys(doc.items).filter(
      (id) =>
        (doc.items[id] as { properties?: { propertiesType?: string } }).properties
          ?.propertiesType === "ItemPropertiesWeapon",
    );
    const visited = new Set<string>();
    const unresolved: string[] = [];
    for (let owner = stack.pop(); owner !== undefined; owner = stack.pop()) {
      if (visited.has(owner)) continue;
      visited.add(owner);
      for (const slot of graph.owners[owner]?.slots ?? []) {
        for (const id of slot.allowedItemIds) {
          if (!byId.has(id)) unresolved.push(id);
          stack.push(id);
        }
      }
    }
    expect(visited.size).toBeGreaterThan(40);
    expect(unresolved).toEqual([]);
  });

  it("carries the real modifiers of a barrel, a scope and a magazine", async () => {
    const byId = partsById(await fixturePartCatalog());
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
    const part: AttachablePart = { ...snapshotPartSchema.parse(raw), buyFor: [] };
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
    const parts = await fixturePartCatalog();
    const barrel = partsById(parts).get(BARREL_10_3)!;
    expect(barrel.conflictingItems.length).toBe(3);
    expect(barrel.conflictingSlotIds).toEqual([]);
    expect(parts.some((p) => (p.buyFor ?? []).length > 0)).toBe(true);
    for (const p of parts) {
      expect(p.name).not.toMatch(/ Name$/);
      for (const entry of p.buyFor ?? []) {
        expect(["TraderOffer", "TraderBarter", "FleaMarket"]).toContain(entry.vendor.__typename);
        expect(entry.vendor.normalizedName).not.toBe("");
      }
    }
  });

  it("resolves barters through the offer resolver, for a barter-only scope too", async () => {
    // ELCAN SpecterDR (FDE): no cash offer anywhere, bartered by Mechanic and Peacekeeper.
    const elcan = partsById(await fixturePartCatalog()).get("57aca93d2459771f2c7e26db")!;
    expect(elcan.properties.propertiesType).toBe("ItemPropertiesScope");
    expect(elcan.buyFor?.some((b) => b.vendor.__typename === "TraderBarter")).toBe(true);
    expect(elcan.buyFor?.some((b) => b.vendor.__typename === "TraderOffer")).toBe(false);
  });

  it("carries no craft or barter sourcing fields", async () => {
    // Barters arrive inside `buyFor` as `TraderBarter` entries; crafting lives in the upstream
    // `/crafts` resource, which nothing here fetches. A part carries no separate field for
    // either, and Zod strips them if upstream starts sending them.
    for (const part of await fixturePartCatalog()) {
      expect(part).not.toHaveProperty("craftsFor");
      expect(part).not.toHaveProperty("bartersFor");
    }
  });
});
