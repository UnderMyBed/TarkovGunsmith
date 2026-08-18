import { describe, expect, it } from "vitest";
import { fetchWeaponTree, normalizeSlots, type SlotNode } from "./weaponTree.js";
import { fixtureClient } from "../__fixtures__/client.js";
import fixture from "../__fixtures__/items-sample.json" with { type: "json" };

function firstGunId(): string {
  const gun = Object.values(fixture.document.data.items).find(
    (i) => i.properties?.propertiesType === "ItemPropertiesWeapon",
  );
  return (gun as { id: string }).id;
}

function maxDepth(nodes: readonly SlotNode[], d = 1): number {
  return nodes.reduce((max, n) => Math.max(max, n.children.length ? maxDepth(n.children, d + 1) : d), d);
}

describe("fetchWeaponTree", () => {
  it("returns a normalized tree", async () => {
    const tree = await fetchWeaponTree(fixtureClient(), firstGunId());
    expect(tree.weaponId).toBe(firstGunId());
    expect(tree.slots.length).toBeGreaterThan(0);
    for (const slot of tree.slots) {
      expect(typeof slot.nameId).toBe("string");
      expect(slot.path).toBe(slot.nameId);
      expect(slot.allowedItemIds).toBeInstanceOf(Set);
    }
  });

  it("resolves allowed item ids into named items", async () => {
    const tree = await fetchWeaponTree(fixtureClient(), firstGunId());
    const withItems = tree.slots.filter((s) => s.allowedItems.length > 0);
    expect(withItems.length).toBeGreaterThan(0);
    for (const slot of withItems) {
      for (const item of slot.allowedItems) {
        expect(typeof item.id).toBe("string");
        // A resolved item carries its real name; an unresolved one would fall back to its id.
        expect(item.name).not.toBe(item.id);
      }
    }
  });

  it("throws if the weapon id is missing", async () => {
    await expect(fetchWeaponTree(fixtureClient(), "no-such-id")).rejects.toThrow(/not found/);
  });

  it("throws if the item is not a weapon", async () => {
    const ammo = Object.values(fixture.document.data.items).find(
      (i) => i.properties?.propertiesType === "ItemPropertiesAmmo",
    ) as { id: string };
    await expect(fetchWeaponTree(fixtureClient(), ammo.id)).rejects.toThrow(/not a weapon/);
  });

  it("bounds recursion, so a cyclic slot graph terminates", async () => {
    const tree = await fetchWeaponTree(fixtureClient(), firstGunId());
    expect(maxDepth(tree.slots)).toBeLessThanOrEqual(3);
  });

  it("stops resolving at depth 0", () => {
    const ctx = { items: fixture.document.data.items as Record<string, unknown>, categories: {} };
    expect(normalizeSlots([{ nameId: "x", filters: { allowedItems: [] } }], "", ctx, 0)).toEqual([]);
  });
});
