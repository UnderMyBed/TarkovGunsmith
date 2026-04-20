import { describe, expect, it, vi } from "vitest";
import { fetchModList, modListSchema } from "./modList.js";
import { createTarkovClient } from "../client.js";

const sampleMod = {
  id: "mod-1",
  name: "AK-74N Rail",
  shortName: "Rail",
  iconLink: "https://assets.tarkov.dev/mod-1-icon.webp",
  weight: 0.05,
  types: ["mods"],
  minLevelForFlea: null,
  properties: {
    __typename: "ItemPropertiesWeaponMod",
    ergonomics: 2,
    recoilModifier: -0.01,
    accuracyModifier: 0,
  },
  buyFor: [
    {
      priceRUB: 5000,
      currency: "RUB",
      vendor: {
        __typename: "TraderOffer",
        normalizedName: "prapor",
        minTraderLevel: 2,
        taskUnlock: null,
        trader: { normalizedName: "prapor" },
      },
    },
    {
      priceRUB: 7500,
      currency: "RUB",
      vendor: {
        __typename: "FleaMarket",
        normalizedName: "flea-market",
        minPlayerLevel: 15,
      },
    },
  ],
};

const fixture = { data: { items: [sampleMod] } };

describe("modListSchema", () => {
  it("parses a valid response", () => {
    expect(modListSchema.safeParse(fixture.data).success).toBe(true);
  });
});

describe("fetchModList", () => {
  it("returns parsed WeaponMods only", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchModList(client);
    expect(result).toHaveLength(1);
    expect(result[0]?.properties.__typename).toBe("ItemPropertiesWeaponMod");
  });

  it("includes buyFor with trader and flea vendor variants", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchModList(client);
    expect(result[0]?.buyFor).toHaveLength(2);
    expect(result[0]?.buyFor?.[0]?.vendor.__typename).toBe("TraderOffer");
    expect(result[0]?.buyFor?.[1]?.vendor.__typename).toBe("FleaMarket");
  });

  it("parses types + minLevelForFlea fields", async () => {
    const noFleaMod = { ...sampleMod, id: "mod-2", types: ["mods", "noFlea"], minLevelForFlea: 20 };
    const noFleaFixture = { data: { items: [noFleaMod] } };
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(noFleaFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchModList(client);
    expect(result[0]?.types).toContain("noFlea");
    expect(result[0]?.minLevelForFlea).toBe(20);
  });

  it("filters out magazines, scopes, etc.", async () => {
    const magazine = {
      id: "mag-1",
      name: "PMAG",
      shortName: "PMAG",
      iconLink: "https://assets.tarkov.dev/mag-1-icon.webp",
      weight: 0.1,
      types: [],
      minLevelForFlea: null,
      buyFor: null,
      properties: { __typename: "ItemPropertiesMagazine" },
    };
    const scope = {
      id: "scope-1",
      name: "ACOG",
      shortName: "ACOG",
      iconLink: "https://assets.tarkov.dev/scope-1-icon.webp",
      weight: 0.5,
      types: [],
      minLevelForFlea: null,
      buyFor: null,
      properties: { __typename: "ItemPropertiesScope" },
    };
    const mixed = { data: { items: [magazine, scope, sampleMod] } };
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(mixed), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchModList(client);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(sampleMod.id);
  });
});
