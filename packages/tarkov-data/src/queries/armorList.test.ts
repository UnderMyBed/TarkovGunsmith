import { describe, expect, it, vi } from "vitest";
import { fetchArmorList, armorListSchema } from "./armorList.js";
import { createTarkovClient } from "../client.js";
import fixture from "../__fixtures__/armorList.json" with { type: "json" };

describe("armorListSchema", () => {
  it("parses the recorded fixture without error", () => {
    const result = armorListSchema.safeParse(fixture.data);
    expect(result.success).toBe(true);
  });

  it("rejects responses missing items", () => {
    const result = armorListSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects items with non-numeric armor class", () => {
    const bad = {
      items: [
        {
          ...fixture.data.items[0],
          properties: { ...fixture.data.items[0]!.properties, class: "five" },
        },
      ],
    };
    const result = armorListSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("fetchArmorList", () => {
  it("returns parsed armor entries", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchArmorList(client);
    expect(result).toHaveLength(2);
    expect(result[0]?.properties.class).toBe(3);
    expect(result[1]?.properties.material.destructibility).toBe(0.45);
  });

  it("throws on invalid response shape", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { items: [{}] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await expect(fetchArmorList(client)).rejects.toThrow();
  });
});
