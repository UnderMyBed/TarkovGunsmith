import { describe, expect, it, vi } from "vitest";
import { fetchWeaponList, weaponListSchema } from "./weaponList.js";
import { createTarkovClient } from "../client.js";

const sampleWeapon = {
  id: "5447a9cd4bdc2dbd208b4567",
  name: "Colt M4A1 5.56x45",
  shortName: "M4A1",
  iconLink: "https://assets.tarkov.dev/5447a9cd4bdc2dbd208b4567-icon.webp",
  weight: 2.7,
  types: [],
  buyFor: [],
  properties: {
    __typename: "ItemPropertiesWeapon",
    caliber: "Caliber556x45NATO",
    ergonomics: 50,
    recoilVertical: 56,
    recoilHorizontal: 220,
    fireRate: 800,
  },
};

const fixture = { data: { items: [sampleWeapon] } };

describe("weaponListSchema", () => {
  it("parses a valid response", () => {
    expect(weaponListSchema.safeParse(fixture.data).success).toBe(true);
  });

  it("rejects responses missing items", () => {
    expect(weaponListSchema.safeParse({}).success).toBe(false);
  });
});

describe("fetchWeaponList", () => {
  it("returns parsed weapons", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchWeaponList(client);
    expect(result).toHaveLength(1);
    expect(result[0]?.shortName).toBe("M4A1");
    expect(result[0]?.properties.ergonomics).toBe(50);
  });

  it("filters out items that don't match ItemPropertiesWeapon", async () => {
    const grenadeLauncher = {
      id: "weird",
      name: "Strange item",
      shortName: "X",
      iconLink: "https://assets.tarkov.dev/x-icon.webp",
      weight: 1,
      properties: { __typename: "ItemPropertiesGrenadeLauncher" },
    };
    const mixed = { data: { items: [grenadeLauncher, sampleWeapon] } };
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(mixed), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchWeaponList(client);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(sampleWeapon.id);
  });

  it("parses a weapon with buyFor entries", async () => {
    const withBuyFor = {
      ...sampleWeapon,
      types: ["weapon"],
      buyFor: [
        {
          priceRUB: 43000,
          currency: "RUB",
          vendor: {
            __typename: "TraderOffer",
            normalizedName: "peacekeeper",
            minTraderLevel: 2,
            taskUnlock: null,
            trader: { normalizedName: "peacekeeper" },
          },
        },
      ],
    };
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { items: [withBuyFor] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createTarkovClient("https://example.test/graphql", mockFetch);
    const result = await fetchWeaponList(client);
    expect(result).toHaveLength(1);
    expect(result[0]?.buyFor).toHaveLength(1);
    expect(result[0]?.types).toContain("weapon");
  });
});
