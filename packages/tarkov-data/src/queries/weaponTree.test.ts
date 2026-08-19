import { describe, expect, it } from "vitest";
import {
  fetchWeaponTree,
  normalizeSlots,
  type SlotNode,
  type SlotResolutionContext,
} from "./weaponTree.js";
import { fixtureClient } from "../__fixtures__/client.js";
import fixture from "../__fixtures__/items-sample.json" with { type: "json" };
import type { TarkovJsonClient } from "../client.js";

function firstGunId(): string {
  const gun = Object.values(fixture.document.data.items).find(
    (i) => i.properties?.propertiesType === "ItemPropertiesWeapon",
  );
  return (gun as { id: string }).id;
}

function maxDepth(nodes: readonly SlotNode[], d = 1): number {
  return nodes.reduce(
    (max, n) => Math.max(max, n.children.length ? maxDepth(n.children, d + 1) : d),
    d,
  );
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
    expect(normalizeSlots([{ nameId: "x", filters: { allowedItems: [] } }], "", ctx, 0)).toEqual(
      [],
    );
  });

  it("falls back to the lookup key for weaponId/weaponName, and to an empty tree, when the item carries neither", async () => {
    // Covers `item.id`/`item.name` falling back to the `weaponId` parameter,
    // `properties.slots` falling back to `[]`, and `itemCategories` falling back to `{}` —
    // the real fixture's weapons and document always carry all four.
    const client: TarkovJsonClient = {
      fetchResource: <T>(): Promise<T> =>
        Promise.resolve({
          items: {
            "bare-weapon-id": {
              // No `id`, no `name`, no `properties.slots`.
              properties: { propertiesType: "ItemPropertiesWeapon" },
            },
          },
          // No `itemCategories` at all.
        } as T),
    };
    const tree = await fetchWeaponTree(client, "bare-weapon-id");
    expect(tree.weaponId).toBe("bare-weapon-id");
    expect(tree.weaponName).toBe("bare-weapon-id");
    expect(tree.slots).toEqual([]);
  });
});

describe("normalizeSlots — field fallbacks and category resolution", () => {
  // The live document's 3,564 slots all carry an empty `allowedCategories` (see the comment
  // in weaponTree.ts), so none of this ever runs against real fixture data. Every case below
  // needs a hand-built ctx/slots pair instead.
  const ctx: SlotResolutionContext = {
    items: {
      resolvedItem: {
        name: "Resolved Item",
        properties: { propertiesType: "ItemPropertiesWeaponMod", slots: [] },
      },
      unnamedItem: {
        // No `name` — the allowed item should fall back to its own id.
        properties: { propertiesType: "ItemPropertiesWeaponMod", slots: [] },
      },
    },
    categories: {
      cat1: { id: "cat1", name: "Category One", normalizedName: "category-one" },
      missingId: { name: "N", normalizedName: "nn" },
      missingName: { id: "i2", normalizedName: "nn2" },
      missingNormalizedName: { id: "i3", name: "n3" },
    },
  };

  it("resolves allowed items and categories, falling back for every malformed shape", () => {
    const slots = [
      {
        // No `nameId`, no `name` — both fall back (nameId -> "", name -> nameId).
        filters: {
          allowedItems: [
            "resolvedItem",
            "unnamedItem",
            42, // non-string id: skipped
            "no-such-item", // unresolvable id: skipped
          ],
          allowedCategories: [
            "cat1", // string, resolves to a valid category: kept
            "no-such-category", // string, resolves to undefined: asCategory -> null
            null, // non-string entry that is itself null: asCategory -> null
            "missingId", // resolves but missing `id`: asCategory -> null
            "missingName", // resolves but missing `name`: asCategory -> null
            "missingNormalizedName", // resolves but missing `normalizedName`: asCategory -> null
            { id: "inline", name: "Inline Category", normalizedName: "inline-category" }, // non-string entry, already a valid category object: kept
          ],
        },
      },
      {
        nameId: "slot2",
        // No `filters` at all — both allowedItems and allowedCategories fall back to [].
      },
    ];

    const [first, second] = normalizeSlots(slots, "", ctx);

    expect(first?.nameId).toBe("");
    expect(first?.name).toBe(""); // falls back to nameId, which itself fell back to ""
    expect(first?.allowedItems.map((i) => [i.id, i.name])).toEqual([
      ["resolvedItem", "Resolved Item"],
      ["unnamedItem", "unnamedItem"], // fell back to its own id
    ]);
    expect(first?.allowedCategories).toEqual([
      { id: "cat1", name: "Category One", normalizedName: "category-one" },
      { id: "inline", name: "Inline Category", normalizedName: "inline-category" },
    ]);

    expect(second?.nameId).toBe("slot2");
    expect(second?.name).toBe("slot2"); // explicit `name` absent, falls back to nameId
    expect(second?.allowedItems).toEqual([]);
    expect(second?.allowedCategories).toEqual([]);
  });
});
