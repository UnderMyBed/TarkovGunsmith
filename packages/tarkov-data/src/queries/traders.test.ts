import { describe, expect, it } from "vitest";
import { fetchTraderDirectory, fetchTraders } from "./traders.js";
import type { TarkovJsonClient } from "../client.js";
import { fixtureClient } from "../__fixtures__/client.js";

describe("fetchTraders", () => {
  it("returns traders with id, name and normalizedName", async () => {
    const traders = await fetchTraders(fixtureClient());
    expect(traders.length).toBeGreaterThan(0);
    for (const t of traders) {
      expect(typeof t.id).toBe("string");
      expect(typeof t.normalizedName).toBe("string");
    }
  });

  it("resolves translated names rather than translation keys", async () => {
    const traders = await fetchTraders(fixtureClient());
    for (const t of traders) expect(t.name).not.toMatch(/ Nickname$/);
  });

  it("returns only profile-gating traders", async () => {
    const traders = await fetchTraders(fixtureClient());
    for (const t of traders) {
      expect([
        "prapor",
        "therapist",
        "skier",
        "peacekeeper",
        "mechanic",
        "ragman",
        "jaeger",
      ]).toContain(t.normalizedName);
    }
  });
});

describe("fetchTraderDirectory", () => {
  it("keeps the traders the profile does not track, such as Ref and Fence", async () => {
    const names = (await fetchTraderDirectory(fixtureClient())).map((t) => t.normalizedName);
    expect(names).toEqual(expect.arrayContaining(["prapor", "jaeger", "ref", "fence"]));
  });

  it("drops a record that fails the trader schema instead of failing the document", async () => {
    const base = fixtureClient();
    const client: TarkovJsonClient = {
      fetchResource: async <T>(resource: string): Promise<T> => {
        const doc = await base.fetchResource<Record<string, unknown>>(resource);
        return { ...doc, broken: { id: "broken", normalizedName: 7 } } as T;
      },
    };
    const traders = await fetchTraderDirectory(client);
    expect(traders.map((t) => t.id)).not.toContain("broken");
    expect(traders.map((t) => t.normalizedName)).toContain("ref");
  });
});
