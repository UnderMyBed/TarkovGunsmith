import { describe, expect, it, vi } from "vitest";
import { parse as parseGraphQL } from "graphql";
import { fetchWeaponTree, normalizeSlots, WEAPON_TREE_QUERY, type SlotNode } from "./weaponTree.js";
import { createTarkovClient } from "../client.js";

// Minimal fake GraphQL response matching the query shape at depth 3.
const responseFixture = {
  data: {
    item: {
      id: "w1",
      name: "Test Weapon",
      properties: {
        __typename: "ItemPropertiesWeapon",
        slots: [
          {
            id: "slot-scope",
            nameId: "mod_scope",
            name: "Scope",
            required: false,
            filters: {
              allowedItems: [
                {
                  id: "s1",
                  name: "Scope A",
                  properties: { __typename: "ItemPropertiesWeaponMod", slots: [] },
                },
                {
                  id: "s2",
                  name: "Scope B w/ mount slot",
                  properties: {
                    __typename: "ItemPropertiesWeaponMod",
                    slots: [
                      {
                        id: "slot-mount",
                        nameId: "mod_mount",
                        name: "Mount",
                        required: false,
                        filters: {
                          allowedItems: [
                            {
                              id: "m1",
                              name: "Mount A",
                              properties: { __typename: "ItemPropertiesWeaponMod", slots: [] },
                            },
                          ],
                          allowedCategories: [],
                        },
                      },
                    ],
                  },
                },
              ],
              allowedCategories: [
                { id: "cat-scope", name: "Scope", normalizedName: "scope" },
                { id: "cat-sight", name: "Iron Sight", normalizedName: "iron-sight" },
              ],
            },
          },
          {
            id: "slot-muzzle",
            nameId: "mod_muzzle",
            name: "Muzzle",
            required: false,
            filters: null,
          },
          {
            id: "slot-rail",
            nameId: "mod_rail",
            name: "Rail",
            required: false,
            filters: {
              allowedItems: [],
              allowedCategories: [
                { id: "cat-rail", name: "Rail accessory", normalizedName: "rail-accessory" },
                null,
              ],
            },
          },
        ],
      },
    },
  },
};

describe("fetchWeaponTree", () => {
  it("returns a normalized tree", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(responseFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const tree = await fetchWeaponTree(client, "w1");
    expect(tree.weaponId).toBe("w1");
    expect(tree.weaponName).toBe("Test Weapon");
    expect(tree.slots).toHaveLength(3);

    const scope = tree.slots[0]!;
    expect(scope.nameId).toBe("mod_scope");
    expect(scope.path).toBe("mod_scope");
    expect(scope.allowedItems).toHaveLength(2);
    expect(scope.allowedItems.map((i) => i.id)).toEqual(["s1", "s2"]);

    const scopeBChildren = scope.allowedItems[1]!.children;
    expect(scopeBChildren).toHaveLength(1);
    expect(scopeBChildren[0]!.path).toBe("mod_scope/mod_mount");

    const muzzle = tree.slots[1]!;
    expect(muzzle.nameId).toBe("mod_muzzle");
    expect(muzzle.allowedItems).toEqual([]);
  });

  it("throws if the item is missing from the response", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { item: null } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await expect(fetchWeaponTree(client, "w1")).rejects.toThrow(/not found/);
  });

  it("throws if the item's properties aren't ItemPropertiesWeapon", async () => {
    const fixture = {
      data: {
        item: {
          id: "not-a-weapon",
          name: "Grenade",
          properties: { __typename: "ItemPropertiesGrenade" },
        },
      },
    };
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await expect(fetchWeaponTree(client, "not-a-weapon")).rejects.toThrow(/not a weapon/);
  });
});

describe("normalizeSlots", () => {
  it("produces allowedItemIds Sets for migration consumption", () => {
    const normalized = normalizeSlots(responseFixture.data.item.properties.slots, "");
    expect(normalized[0]!.allowedItemIds).toBeInstanceOf(Set);
    expect(normalized[0]!.allowedItemIds.has("s1")).toBe(true);
    expect(normalized[0]!.allowedItemIds.has("s2")).toBe(true);
  });

  it("handles null filters safely (empty allowedItems + empty allowedItemIds)", () => {
    const normalized = normalizeSlots(responseFixture.data.item.properties.slots, "");
    const muzzle = normalized[1]!;
    expect(muzzle.allowedItems).toEqual([]);
    expect(muzzle.allowedItemIds.size).toBe(0);
  });

  it("builds slot paths by joining nameIds with / separator", () => {
    const normalized = normalizeSlots(responseFixture.data.item.properties.slots, "");
    expect(normalized[0]!.path).toBe("mod_scope");
    const scopeB = normalized[0]!.allowedItems[1]!;
    expect(scopeB.children[0]!.path).toBe("mod_scope/mod_mount");
  });

  it("populates allowedCategories on slots that have them", () => {
    const result = normalizeSlots(responseFixture.data.item.properties.slots as unknown[], "");
    const scope = result.find((s) => s.nameId === "mod_scope");
    expect(scope?.allowedCategories).toEqual([
      { id: "cat-scope", name: "Scope", normalizedName: "scope" },
      { id: "cat-sight", name: "Iron Sight", normalizedName: "iron-sight" },
    ]);
  });

  it("drops null entries from allowedCategories (upstream tolerance)", () => {
    const result = normalizeSlots(responseFixture.data.item.properties.slots as unknown[], "");
    const rail = result.find((s) => s.nameId === "mod_rail");
    expect(rail?.allowedCategories).toHaveLength(1);
    expect(rail?.allowedCategories[0]?.normalizedName).toBe("rail-accessory");
  });

  it("returns empty allowedCategories when filters are null", () => {
    const result = normalizeSlots(responseFixture.data.item.properties.slots as unknown[], "");
    const muzzle = result.find((s) => s.nameId === "mod_muzzle");
    expect(muzzle?.allowedCategories).toEqual([]);
  });
});

describe("WEAPON_TREE_QUERY", () => {
  it("is valid GraphQL syntax", () => {
    // Prod regression: the recursive buildSlotSelection generator used to emit
    // an empty `slots {}` at the innermost level, which the API rejects with
    // "Syntax Error: Expected Name, found '}'". Parse-verify the query here
    // so any future drift in the generator fails at test time, not runtime.
    expect(() => parseGraphQL(WEAPON_TREE_QUERY)).not.toThrow();
  });

  it("contains no empty selection sets", () => {
    // GraphQL forbids `foo {}` — a selection set must contain at least one
    // field or fragment. The old buildSlotSelection(0) === "" path violated
    // this. Guard explicitly so the regression message is obvious.
    expect(WEAPON_TREE_QUERY).not.toMatch(/\{\s*\}/);
  });

  it("WEAPON_TREE_QUERY parses as valid GraphQL (recursive depth guard)", () => {
    expect(() => parseGraphQL(WEAPON_TREE_QUERY)).not.toThrow();
  });

  it("WEAPON_TREE_QUERY queries allowedCategories", () => {
    expect(WEAPON_TREE_QUERY).toMatch(/allowedCategories\s*\{[^}]*normalizedName/);
  });
});

type _SlotNode = SlotNode; // ensure the type is exported
