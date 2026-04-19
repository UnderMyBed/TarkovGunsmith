import { describe, expect, it, vi } from "vitest";
import { fetchWeapon, weaponSchema } from "./weapon.js";
import { createTarkovClient } from "../client.js";
import fixture from "../__fixtures__/weapon.json" with { type: "json" };

describe("weaponSchema", () => {
  it("parses the recorded fixture without error", () => {
    const result = weaponSchema.safeParse(fixture.data);
    expect(result.success).toBe(true);
  });

  it("rejects responses where item is null", () => {
    const result = weaponSchema.safeParse({ item: null });
    expect(result.success).toBe(false);
  });

  it("rejects items with non-numeric ergonomics", () => {
    const bad = {
      item: {
        ...fixture.data.item,
        properties: { ...fixture.data.item.properties, ergonomics: "high" },
      },
    };
    const result = weaponSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("fetchWeapon", () => {
  it("sends the id as a variable", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await fetchWeapon(client, "5447a9cd4bdc2dbd208b4567");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callBody = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body ?? "{}")) as {
      variables?: { id?: string };
    };
    expect(callBody.variables?.id).toBe("5447a9cd4bdc2dbd208b4567");
  });

  it("returns the parsed weapon", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchWeapon(client, "5447a9cd4bdc2dbd208b4567");
    expect(result.shortName).toBe("M4A1");
    expect(result.weight).toBe(2.7);
  });

  it("throws when the api returns no item for the id", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { item: null } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    await expect(fetchWeapon(client, "missing")).rejects.toThrow();
  });
});
