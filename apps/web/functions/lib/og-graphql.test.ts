import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchOgRowsForBuild, OG_JSON_API_BASE } from "./og-graphql.js";

function slot(nameId: string, allowedItems: string[]) {
  return {
    id: `w1:${nameId}`,
    nameId,
    name: nameId,
    required: false,
    filters: { allowedItems, allowedCategories: [] },
  };
}

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
          slots: [
            slot("mod_foregrip", ["m1"]),
            slot("mod_barrel", ["55d35ee94bdc2d61338b4568"]),
            slot("camora_000", ["54527ac44bdc2d36668b4567"]),
          ],
        },
      },
      m1: {
        id: "m1",
        name: "AR-15 KAC RIS foregrip",
        shortName: "RVG",
        iconLink: "https://assets.tarkov.dev/m1-icon.webp",
        weight: 0.1,
        conflictingItems: [],
        conflictingSlotIds: [],
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
      // Real values: the AR-15 10.3" barrel and the M855A1 cartridge, as upstream sends them.
      "55d35ee94bdc2d61338b4568": {
        id: "55d35ee94bdc2d61338b4568",
        name: "AR-15 5.56x45 10.3 inch barrel",
        shortName: "10.3",
        iconLink: "https://assets.tarkov.dev/55d35ee94bdc2d61338b4568-icon.webp",
        weight: 0.409,
        types: ["mods"],
        minLevelForFlea: 0,
        avg24hPrice: 12000,
        conflictingItems: [],
        conflictingSlotIds: [],
        properties: {
          propertiesType: "ItemPropertiesBarrel",
          ergonomics: -2,
          recoilModifier: -0.052,
          accuracyModifier: 0,
        },
        buyFromTrader: [],
      },
      "54527ac44bdc2d36668b4567": {
        id: "54527ac44bdc2d36668b4567",
        name: "5.56x45mm M855A1",
        shortName: "M855A1",
        iconLink: "https://assets.tarkov.dev/54527ac44bdc2d36668b4567-icon.webp",
        weight: 0.012,
        types: ["ammo"],
        minLevelForFlea: 0,
        avg24hPrice: 800,
        conflictingItems: [],
        conflictingSlotIds: [],
        properties: { propertiesType: "ItemPropertiesAmmo", recoilModifier: 0.05 },
        buyFromTrader: [],
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
    const out = await fetchOgRowsForBuild({ weaponId: "w1", attachments: {} });
    expect(out.weapon).toMatchObject({
      id: "w1",
      shortName: "M4A1",
      properties: { ergonomics: 50, recoilVertical: 70, recoilHorizontal: 250 },
    });
  });

  it("returns mods with flattened buyFor offers", async () => {
    const out = await fetchOgRowsForBuild({ weaponId: "w1", attachments: { mod_foregrip: "m1" } });
    const mod = out.mods[0]!;
    expect(mod).toMatchObject({ id: "m1", shortName: "RVG", weight: 0.1 });
    expect(mod.buyFor).toContainEqual({
      vendor: { normalizedName: "prapor" },
      priceRUB: 8000,
      minTraderLevel: 2,
    });
  });

  it("counts a barrel's modifiers, and only a cartridge's weight", async () => {
    // The Builder's own rule (adaptMod): upstream preset stats leave cartridge recoil out.
    const out = await fetchOgRowsForBuild({
      weaponId: "w1",
      attachments: {
        mod_barrel: "55d35ee94bdc2d61338b4568",
        camora_000: "54527ac44bdc2d36668b4567",
      },
    });
    expect(out.mods.map((m) => [m.id, m.weight, m.properties])).toEqual([
      [
        "55d35ee94bdc2d61338b4568",
        0.409,
        { ergonomics: -2, recoilModifier: -0.052, accuracyModifier: 0 },
      ],
      [
        "54527ac44bdc2d36668b4567",
        0.012,
        { ergonomics: 0, recoilModifier: 0, accuracyModifier: 0 },
      ],
    ]);
  });

  it("skips mod ids that are not in the document instead of throwing", async () => {
    const out = await fetchOgRowsForBuild({
      weaponId: "w1",
      attachments: { mod_foregrip: "m1", camora_000: "ghost" },
    });
    expect(out.mods.map((m) => m.id)).toEqual(["m1"]);
  });

  it("leaves keys that are not on the weapon off the card", async () => {
    const out = await fetchOgRowsForBuild({
      weaponId: "w1",
      attachments: {
        mod_foregrip: "m1",
        "mod_handguard/mod_barrel": "55d35ee94bdc2d61338b4568",
        camora_000: "m1",
      },
    });
    expect(out.attachments).toEqual({ mod_foregrip: "m1" });
    expect(out.mods.map((m) => m.id)).toEqual(["m1"]);
  });

  it("throws when the weapon id is unknown", async () => {
    await expect(fetchOgRowsForBuild({ weaponId: "ghost", attachments: {} })).rejects.toThrow(
      /not found/,
    );
  });
});
