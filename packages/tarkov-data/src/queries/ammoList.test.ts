import { describe, expect, it, vi } from "vitest";
import { fetchAmmoList, ammoListSchema } from "./ammoList.js";
import { createTarkovClient } from "../client.js";
import fixture from "../__fixtures__/ammoList.json" with { type: "json" };

describe("ammoListSchema", () => {
  it("parses the recorded fixture without error", () => {
    const result = ammoListSchema.safeParse(fixture.data);
    expect(result.success).toBe(true);
  });

  it("rejects responses missing the items array", () => {
    const result = ammoListSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects items with non-numeric penetrationPower", () => {
    const bad = {
      items: [
        {
          ...fixture.data.items[0],
          properties: { ...fixture.data.items[0]!.properties, penetrationPower: "not a number" },
        },
      ],
    };
    const result = ammoListSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("fetchAmmoList", () => {
  it("returns parsed ammo entries from the GraphQL response", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchAmmoList(client);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("5656d7c34bdc2d9d198b4587");
    expect(result[0]?.properties.penetrationPower).toBe(21);
  });

  it("throws when the outer envelope is malformed (no items array)", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { items: "not an array" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await expect(fetchAmmoList(client)).rejects.toThrow();
  });

  it("filters out non-ammo items (e.g. grenades) silently", async () => {
    // Mirrors what api.tarkov.dev actually returns for `items(type: ammo)`:
    // mixed `ItemPropertiesAmmo` and `ItemPropertiesGrenade`. Real bug from
    // first deploy of the Smoke route.
    const grenade = {
      id: "5448be9a4bdc2dfd2f8b456a",
      name: "RGD-5 hand grenade",
      shortName: "RGD-5",
      iconLink: "https://assets.tarkov.dev/5448be9a4bdc2dfd2f8b456a-icon.webp",
      properties: { __typename: "ItemPropertiesGrenade" },
    };
    const mixed = {
      data: { items: [grenade, ...fixture.data.items] },
    };
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(mixed), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchAmmoList(client);
    expect(result).toHaveLength(fixture.data.items.length);
    expect(result.every((i) => i.properties.__typename === "ItemPropertiesAmmo")).toBe(true);
  });
});
