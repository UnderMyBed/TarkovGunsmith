import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchOgRowsForBuild, OG_JSON_API_BASE } from "./og-graphql.js";

const ITEMS = {
  data: {
    items: {
      w1: {
        id: "w1",
        shortName: "M4A1",
        properties: {
          propertiesType: "ItemPropertiesWeapon",
          ergonomics: 50,
          recoilVertical: 70,
          recoilHorizontal: 250,
        },
      },
      m1: {
        id: "m1",
        shortName: "RVG",
        weight: 0.1,
        types: ["mods"],
        minLevelForFlea: 5,
        avg24hPrice: 9000,
        properties: {
          propertiesType: "ItemPropertiesWeaponMod",
          ergonomics: 3,
          recoilModifier: -0.01,
          accuracyModifier: 0,
        },
        buyFromTrader: [
          { trader: "tr1", priceRUB: 8000, currency: "RUB", minTraderLevel: 2, taskUnlock: null },
        ],
      },
    },
  },
};

const TRADERS = {
  data: { tr1: { id: "tr1", name: "Prapor", normalizedName: "prapor" } },
};

const TASKS = { data: { tasks: {} } };

function routeFetch(url: string): Response {
  if (url.endsWith("/items")) return new Response(JSON.stringify(ITEMS), { status: 200 });
  if (url.endsWith("/traders")) return new Response(JSON.stringify(TRADERS), { status: 200 });
  if (url.endsWith("/tasks")) return new Response(JSON.stringify(TASKS), { status: 200 });
  return new Response("{}", { status: 404 });
}

describe("fetchOgRowsForBuild", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        Promise.resolve(
          routeFetch(
            input instanceof URL ? input.href : typeof input === "string" ? input : input.url,
          ),
        ),
      ),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("targets the JSON API rather than the retired GraphQL endpoint", () => {
    expect(OG_JSON_API_BASE).toBe("https://json.tarkov.dev/regular/");
  });

  it("returns the weapon with its stats", async () => {
    const out = await fetchOgRowsForBuild({ weaponId: "w1", modIds: [] });
    expect(out.weapon).toMatchObject({
      id: "w1",
      shortName: "M4A1",
      properties: { ergonomics: 50, recoilVertical: 70, recoilHorizontal: 250 },
    });
  });

  it("returns mods with flattened buyFor offers", async () => {
    const out = await fetchOgRowsForBuild({ weaponId: "w1", modIds: ["m1"] });
    const mod = out.mods[0]!;
    expect(mod).toMatchObject({ id: "m1", shortName: "RVG", weight: 0.1 });
    expect(mod.buyFor).toContainEqual({
      vendor: { normalizedName: "prapor" },
      priceRUB: 8000,
      minTraderLevel: 2,
    });
  });

  it("skips mod ids that are not in the document instead of throwing", async () => {
    const out = await fetchOgRowsForBuild({ weaponId: "w1", modIds: ["m1", "ghost"] });
    expect(out.mods.map((m) => m.id)).toEqual(["m1"]);
  });

  it("throws when the weapon id is unknown", async () => {
    await expect(fetchOgRowsForBuild({ weaponId: "ghost", modIds: [] })).rejects.toThrow(
      /not found/,
    );
  });
});
