import { describe, expect, it, vi } from "vitest";
import { fetchModList, modListSchema } from "./modList.js";
import { createTarkovClient } from "../client.js";

const sampleMod = {
  id: "544909bb4bdc2d6f028b4577",
  name: "L3Harris AN/PEQ-15 tactical device",
  shortName: "AN/PEQ-15",
  iconLink: "https://assets.tarkov.dev/544909bb4bdc2d6f028b4577-icon.webp",
  weight: 0.21,
  properties: {
    __typename: "ItemPropertiesWeaponMod",
    ergonomics: -1,
    recoilModifier: 0,
    accuracyModifier: 0,
  },
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

  it("filters out magazines, scopes, etc.", async () => {
    const magazine = {
      id: "mag-1",
      name: "PMAG",
      shortName: "PMAG",
      iconLink: "https://assets.tarkov.dev/mag-1-icon.webp",
      weight: 0.1,
      properties: { __typename: "ItemPropertiesMagazine" },
    };
    const scope = {
      id: "scope-1",
      name: "ACOG",
      shortName: "ACOG",
      iconLink: "https://assets.tarkov.dev/scope-1-icon.webp",
      weight: 0.5,
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
