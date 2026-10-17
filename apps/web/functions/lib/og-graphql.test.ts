import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBuilderSnapshot, type SnapshotDocuments } from "@tarkov/data";
import {
  fetchOgRowsForBuild,
  loadOgData,
  OG_PRICES_PATH,
  OG_SNAPSHOT_PATH,
  resetOgData,
  type OgData,
} from "./og-graphql.js";

const BARREL = "55d35ee94bdc2d61338b4568";
const M855A1 = "54527ac44bdc2d36668b4567";

function slot(nameId: string, allowedItems: string[]) {
  return {
    id: `w1:${nameId}`,
    nameId,
    name: nameId,
    required: false,
    filters: { allowedItems, allowedCategories: [] },
  };
}

function part(id: string, extra: Record<string, unknown>) {
  return {
    id,
    name: `Part ${id}`,
    shortName: id,
    iconLink: `https://assets.tarkov.dev/${id}-icon.webp`,
    types: ["mods"],
    minLevelForFlea: 0,
    conflictingItems: [],
    conflictingSlotIds: [],
    buyFromTrader: [],
    ...extra,
  };
}

/** Upstream-shaped documents that pass the snapshot generator's strict parse. */
function documents(): SnapshotDocuments {
  return {
    items: {
      items: {
        w1: {
          id: "w1",
          name: "Colt M4A1",
          shortName: "M4A1",
          iconLink: "https://assets.tarkov.dev/w1-icon.webp",
          weight: 2.9,
          types: ["gun"],
          updated: "2026-10-16T12:00:00.000Z",
          avg24hPrice: 50000,
          buyFromTrader: [],
          properties: {
            propertiesType: "ItemPropertiesWeapon",
            caliber: "Caliber556x45NATO",
            fireRate: 800,
            ergonomics: 50,
            recoilVertical: 70,
            recoilHorizontal: 250,
            slots: [
              slot("mod_foregrip", ["m1"]),
              slot("mod_barrel", [BARREL]),
              slot("camora_000", [M855A1]),
              slot("mod_stock", ["bartered"]),
            ],
          },
        },
        m1: part("m1", {
          shortName: "RVG",
          weight: 0.1,
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
        }),
        // Real values: the AR-15 10.3" barrel and the M855A1 cartridge, as upstream sends them.
        [BARREL]: part(BARREL, {
          shortName: "10.3",
          weight: 0.409,
          avg24hPrice: 12000,
          properties: {
            propertiesType: "ItemPropertiesBarrel",
            ergonomics: -2,
            recoilModifier: -0.052,
            accuracyModifier: 0,
          },
        }),
        [M855A1]: part(M855A1, {
          shortName: "M855A1",
          weight: 0.012,
          types: ["ammo"],
          avg24hPrice: 800,
          properties: { propertiesType: "ItemPropertiesAmmo", recoilModifier: 0.05 },
        }),
        // Only sold for a barter, and not on the flea.
        bartered: part("bartered", {
          weight: 0.3,
          types: ["mods", "noFlea"],
          properties: {
            propertiesType: "ItemPropertiesWeaponMod",
            ergonomics: 1,
            recoilModifier: 0,
            accuracyModifier: 0,
          },
        }),
        nuts: { id: "nuts", name: "Nuts", shortName: "Nuts", avg24hPrice: 100, types: [] },
      },
    },
    traders: { tr1: { id: "tr1", name: "Prapor", normalizedName: "prapor" } },
    tasks: { tasks: {} },
    barters: [
      {
        id: "b1",
        trader: "tr1",
        taskUnlock: null,
        minTraderLevel: 3,
        requiredItems: [{ item: "nuts", count: 4, attributes: {} }],
        offeredItem: { item: "bartered", count: 1, attributes: {} },
      },
    ],
  };
}

function ogData(): OgData {
  return buildBuilderSnapshot(documents(), "fixtures");
}

describe("fetchOgRowsForBuild", () => {
  it("returns the weapon with its stats", () => {
    const out = fetchOgRowsForBuild({ weaponId: "w1", attachments: {} }, ogData());
    expect(out.weapon).toEqual({
      id: "w1",
      shortName: "M4A1",
      properties: { ergonomics: 50, recoilVertical: 70, recoilHorizontal: 250 },
    });
  });

  it("returns mods with their priced offers, the trader level flattened up", () => {
    const out = fetchOgRowsForBuild(
      { weaponId: "w1", attachments: { mod_foregrip: "m1", mod_stock: "bartered" } },
      ogData(),
    );
    const [m1, bartered] = out.mods;
    expect(m1).toMatchObject({ id: "m1", shortName: "RVG", weight: 0.1 });
    expect(m1!.buyFor).toEqual([
      { vendor: { normalizedName: "prapor" }, priceRUB: 8000, minTraderLevel: 2 },
      { vendor: { normalizedName: "flea-market" }, priceRUB: 9000, minTraderLevel: undefined },
    ]);
    // A barter is gated on its own trader level, priced from its inputs' flea prices.
    expect(bartered!.buyFor).toEqual([
      { vendor: { normalizedName: "prapor" }, priceRUB: 400, minTraderLevel: 3 },
    ]);
  });

  it("leaves an unpriced offer off the card rather than pricing it at 0", () => {
    const data = ogData();
    const trader = { ...data.prices.prices.trader };
    for (const key of Object.keys(trader)) trader[key] = null;
    const items = { ...data.prices.prices.items, m1: [null, null, null] as const };
    const out = fetchOgRowsForBuild(
      { weaponId: "w1", attachments: { mod_foregrip: "m1" } },
      { ...data, prices: { ...data.prices, prices: { items, trader } } },
    );
    expect(out.mods[0]!.buyFor).toEqual([]);
  });

  it("counts a barrel's modifiers, and only a cartridge's weight", () => {
    // The Builder's own rule (adaptMod): upstream preset stats leave cartridge recoil out.
    const out = fetchOgRowsForBuild(
      { weaponId: "w1", attachments: { mod_barrel: BARREL, camora_000: M855A1 } },
      ogData(),
    );
    expect(out.mods.map((m) => [m.id, m.weight, m.properties])).toEqual([
      [BARREL, 0.409, { ergonomics: -2, recoilModifier: -0.052, accuracyModifier: 0 }],
      [M855A1, 0.012, { ergonomics: 0, recoilModifier: 0, accuracyModifier: 0 }],
    ]);
  });

  it("leaves keys that are not on the weapon, or not allowed there, off the card", () => {
    const out = fetchOgRowsForBuild(
      {
        weaponId: "w1",
        attachments: {
          mod_foregrip: "m1",
          "mod_handguard/mod_barrel": BARREL,
          camora_000: "m1",
        },
      },
      ogData(),
    );
    expect(out.attachments).toEqual({ mod_foregrip: "m1" });
    expect(out.mods.map((m) => m.id)).toEqual(["m1"]);
  });

  it("skips a mounted id the snapshot holds no part for", () => {
    const out = fetchOgRowsForBuild(
      { weaponId: "w1", attachments: { mod_barrel: BARREL, camora_000: "ghost" } },
      ogData(),
    );
    expect(out.mods.map((m) => m.id)).toEqual([BARREL]);
  });

  it("throws when the weapon id is unknown", () => {
    expect(() => fetchOgRowsForBuild({ weaponId: "ghost", attachments: {} }, ogData())).toThrow(
      /weapon ghost not found/,
    );
  });
});

describe("loadOgData", () => {
  afterEach(() => resetOgData());

  function assets(status = 200) {
    const data = ogData();
    const bodies: Record<string, unknown> = {
      [OG_SNAPSHOT_PATH]: data.snapshot,
      [OG_PRICES_PATH]: data.prices,
    };
    const calls: string[] = [];
    let current = status;
    const fetcher = {
      fetch: vi.fn((input: string) => {
        const { pathname } = new URL(input);
        calls.push(input);
        return Promise.resolve(
          new Response(JSON.stringify(bodies[pathname]), {
            status: current,
            statusText: current === 200 ? "OK" : "Not Found",
          }),
        );
      }),
    } as unknown as Fetcher;
    return { data, calls, fetcher, setStatus: (s: number) => (current = s) };
  }

  it("reads both files from the request's own origin, once per isolate", async () => {
    const a = assets();
    const first = await loadOgData(a.fetcher, "https://example.com/og/build/abc");
    await loadOgData(a.fetcher, "https://example.com/og/pair/def");
    expect(first).toEqual(a.data);
    expect(a.calls.sort()).toEqual([
      "https://example.com/data/builder-prices.json",
      "https://example.com/data/builder-snapshot.json",
    ]);
  });

  it("fails loudly on a missing file, and tries again next time", async () => {
    const a = assets(404);
    await expect(loadOgData(a.fetcher, "https://example.com/og/build/abc")).rejects.toThrow(
      /\/data\/builder-(snapshot|prices)\.json: 404 Not Found/,
    );
    a.setStatus(200);
    expect(await loadOgData(a.fetcher, "https://example.com/og/build/abc")).toEqual(a.data);
  });

  it("refuses a file of another schema", async () => {
    const a = assets();
    const fetcher = {
      fetch: () => Promise.resolve(new Response(JSON.stringify({ ...a.data.snapshot, schema: 2 }))),
    } as unknown as Fetcher;
    await expect(loadOgData(fetcher, "https://example.com/")).rejects.toThrow(
      "Game data was updated. Reload the page.",
    );
  });
});
