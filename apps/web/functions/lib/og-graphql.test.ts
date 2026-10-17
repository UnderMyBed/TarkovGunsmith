import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adaptMod,
  adaptWeapon,
  resolveBuild,
  BUILDER_SNAPSHOT_SCHEMA,
  buildBuilderSnapshot,
  DEFAULT_PROFILE,
  partsById,
  snapshotPartCatalog,
  snapshotWeaponList,
  snapshotWeaponPresets,
  snapshotWeaponTree,
  type PriceGate,
  type SnapshotDocuments,
} from "@tarkov/data";
import { capturedBuilderData } from "../../src/test/captured-data.js";
import { priceBuild } from "../../src/features/builder/build-price.js";
import { hydrateBuildCard } from "@tarkov/og";
import { weaponSpec } from "@tarkov/ballistics";
import { availabilityPillText } from "./og-availability.js";
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
    updated: "2026-10-16T12:00:00.000Z",
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
          lastLowPrice: 50000,
          buyFromTrader: [],
          velocity: 0,
          properties: {
            propertiesType: "ItemPropertiesWeapon",
            caliber: "Caliber556x45NATO",
            fireRate: 800,
            ergonomics: 50,
            recoilVertical: 70,
            recoilHorizontal: 250,
            centerOfImpact: 0.01,
            deviationCurve: 1.35,
            effectiveDistance: 500,
            sightingRange: 100,
            defaultAmmo: M855A1,
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
          lastLowPrice: 9000,
          velocity: 0,
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
          lastLowPrice: 12000,
          velocity: -11,
          properties: {
            propertiesType: "ItemPropertiesBarrel",
            ergonomics: -2,
            recoilModifier: -0.052,
            accuracyModifier: 0,
            centerOfImpact: 0.07,
            deviationMax: 22,
          },
        }),
        [M855A1]: part(M855A1, {
          shortName: "M855A1",
          weight: 0.012,
          types: ["ammo"],
          lastLowPrice: 800,
          properties: {
            propertiesType: "ItemPropertiesAmmo",
            recoilModifier: 0.05,
            initialSpeed: 945,
          },
        }),
        // Only sold for a barter, and not on the flea.
        bartered: part("bartered", {
          weight: 0.3,
          types: ["mods", "noFlea"],
          velocity: 0,
          properties: {
            propertiesType: "ItemPropertiesWeaponMod",
            ergonomics: 1,
            recoilModifier: 0,
            accuracyModifier: 0,
          },
        }),
        nuts: { id: "nuts", name: "Nuts", shortName: "Nuts", lastLowPrice: 100, types: [] },
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
    const out = fetchOgRowsForBuild({ weaponId: "w1", attachments: {}, gate: null }, ogData());
    expect(out.weapon).toEqual({
      id: "w1",
      shortName: "M4A1",
      properties: {
        ergonomics: 50,
        recoilVertical: 70,
        recoilHorizontal: 250,
        centerOfImpact: 0.01,
        deviationCurve: 1.35,
        velocity: 0,
        fireRate: 800,
        effectiveDistance: 500,
        sightingRange: 100,
        defaultAmmo: { name: "M855A1", initialSpeed: 945 },
      },
    });
  });

  it("returns mods with every offer and its trader level", () => {
    const out = fetchOgRowsForBuild(
      { weaponId: "w1", attachments: { mod_foregrip: "m1", mod_stock: "bartered" }, gate: null },
      ogData(),
    );
    const [m1, bartered] = out.mods;
    expect(m1).toMatchObject({ id: "m1", shortName: "RVG", weight: 0.1 });
    expect(m1!.offers).toEqual([
      { vendor: { normalizedName: "prapor" }, minTraderLevel: 2 },
      { vendor: { normalizedName: "flea-market" }, minTraderLevel: undefined },
    ]);
    // A barter is gated on its own trader level.
    expect(bartered!.offers).toEqual([{ vendor: { normalizedName: "prapor" }, minTraderLevel: 3 }]);
  });

  it("prices the build as the Builder does: weapon plus parts, by the cheapest open path", () => {
    const build = { weaponId: "w1", attachments: { mod_foregrip: "m1", mod_stock: "bartered" } };
    // Theorycraft: the gun on the flea (50,000), m1 from Prapor (8,000, under its 9,000 flea
    // listing), and the barter's four nuts at 100.
    expect(fetchOgRowsForBuild({ ...build, gate: null }, ogData()).priceRub).toBe(58_400);
    // The author's profile: LL3 traders and flea from level 5.
    const author = {
      ...DEFAULT_PROFILE,
      traders: { ...DEFAULT_PROFILE.traders, prapor: 3 },
      flea: true,
      level: 5,
    };
    expect(fetchOgRowsForBuild({ ...build, gate: author }, ogData()).priceRub).toBe(58_400);
    // A fresh profile cannot buy the gun at all, so the card carries no total.
    expect(fetchOgRowsForBuild({ ...build, gate: DEFAULT_PROFILE }, ogData()).priceRub).toBeNull();
  });

  it("keeps an unpriced part's offers for the pill, and leaves the total out, not 0", () => {
    // What a Ref barter for GP coins looks like: an offer whose cost has no flea price.
    const data = ogData();
    const trader = { ...data.prices.prices.trader };
    for (const key of Object.keys(trader)) trader[key] = null;
    const items = { ...data.prices.prices.items, nuts: [null, null, null] as const };
    const out = fetchOgRowsForBuild(
      { weaponId: "w1", attachments: { mod_stock: "bartered" }, gate: null },
      { ...data, prices: { ...data.prices, prices: { items, trader } } },
    );
    const [bartered] = out.mods;
    expect(bartered!.offers).toEqual([{ vendor: { normalizedName: "prapor" }, minTraderLevel: 3 }]);
    expect(availabilityPillText(out.mods, DEFAULT_PROFILE)).toBe("LL3");
    expect(out.priceRub).toBeNull();
    const vm = hydrateBuildCard({
      build: {
        version: 6,
        weaponId: "w1",
        attachments: out.attachments,
        orphaned: [],
        createdAt: "2026-10-16T00:00:00.000Z",
      },
      weapon: out.weapon,
      mods: out.mods,
      priceRub: out.priceRub,
    });
    expect(vm.priceRub).toBeNull();
  });

  it("counts a barrel's modifiers, and only a cartridge's weight", () => {
    // The Builder's own rule (adaptMod): upstream preset stats leave cartridge recoil out.
    const out = fetchOgRowsForBuild(
      { weaponId: "w1", attachments: { mod_barrel: BARREL, camora_000: M855A1 }, gate: null },
      ogData(),
    );
    expect(out.mods.map((m) => [m.id, m.weight, m.properties])).toEqual([
      [BARREL, 0.409, { ergonomics: -2, recoilModifier: -0.052, accuracyModifier: 0 }],
      [M855A1, 0.012, { ergonomics: 0, recoilModifier: 0, accuracyModifier: 0 }],
    ]);
    // The barrel's dispersion and velocity reach the card; the cartridge carries none.
    expect(
      out.mods.map((m) => [m.centerOfImpact, m.deviationMax, m.velocity, m.sightingRange]),
    ).toEqual([
      [0.07, 22, -11, null],
      [0, null, 0, null],
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
        gate: null,
      },
      ogData(),
    );
    expect(out.attachments).toEqual({ mod_foregrip: "m1" });
    expect(out.mods.map((m) => m.id)).toEqual(["m1"]);
  });

  it("skips a mounted id the snapshot holds no part for", () => {
    const out = fetchOgRowsForBuild(
      { weaponId: "w1", attachments: { mod_barrel: BARREL, camora_000: "ghost" }, gate: null },
      ogData(),
    );
    expect(out.mods.map((m) => m.id)).toEqual([BARREL]);
  });

  it("throws when the weapon id is unknown", () => {
    expect(() =>
      fetchOgRowsForBuild({ weaponId: "ghost", attachments: {}, gate: null }, ogData()),
    ).toThrow(/weapon ghost not found/);
  });
});

describe("fetchOgRowsForBuild over the captured documents", () => {
  const M4A1 = "5447a9cd4bdc2dbd208b4567";
  const M4A1_CARBINE = "5af08cf886f774223c269184";
  const PM = "5448bd6b4bdc2dfc2f8b4569";
  const PM_DEFAULT = "58414967245977598f1ad391";

  const captured = (): Promise<OgData> => capturedBuilderData();

  /** What the Builder shows for the same build (`priceBuild`), as a card total. */
  function builderTotal(
    data: OgData,
    weaponId: string,
    attachments: Record<string, string>,
    gate: PriceGate,
  ) {
    const { snapshot } = data;
    const table = data.prices.prices;
    const price = priceBuild(
      gate,
      snapshotWeaponList(snapshot, table).find((w) => w.id === weaponId),
      snapshotWeaponTree(snapshot, weaponId),
      attachments,
      partsById(snapshotPartCatalog(snapshot, table)),
      snapshotWeaponPresets(snapshot, table)[weaponId] ?? [],
    );
    return price?.status === "priced" ? price.totalRUB : null;
  }

  it("prices a stock-preset build as the Builder does: the preset, its parts not paid again", async () => {
    const data = await captured();
    const presets = snapshotWeaponPresets(data.snapshot, data.prices.prices);
    for (const [weaponId, presetId] of [
      [M4A1, M4A1_CARBINE],
      [PM, PM_DEFAULT],
    ] as const) {
      const attachments = { ...presets[weaponId]!.find((p) => p.id === presetId)!.attachments };
      for (const gate of [null, { ...DEFAULT_PROFILE, flea: true, level: 40 }]) {
        const card = fetchOgRowsForBuild({ weaponId, attachments, gate }, data).priceRub;
        expect(card).not.toBeNull();
        expect(card).toBe(builderTotal(data, weaponId, attachments, gate));
      }
    }
    // The Carbine's own flea listing, which the Builder's e2e suite shows too.
    const carbine = { ...presets[M4A1]!.find((p) => p.id === M4A1_CARBINE)!.attachments };
    expect(
      fetchOgRowsForBuild({ weaponId: M4A1, attachments: carbine, gate: null }, data).priceRub,
    ).toBe(26_666);
  });
});

describe("the card's stats against the Builder's for one build", () => {
  const M4A1 = "5447a9cd4bdc2dbd208b4567";
  const SOPMOD = "5a8ae73886f7747b2e6e1416";
  const PEQ15 = "544909bb4bdc2d6f028b4577";
  const HANDGUARD = "mod_reciever/mod_handguard";

  it("counts a part fitted in two slots twice, as the Builder does", async () => {
    const data = await capturedBuilderData();
    const { snapshot } = data;
    const table = data.prices.prices;
    const sopmod = snapshotWeaponPresets(snapshot, table)[M4A1]!.find((p) => p.id === SOPMOD)!;
    const attachments = {
      ...sopmod.attachments,
      [`${HANDGUARD}/mod_tactical`]: PEQ15,
      [`${HANDGUARD}/mod_tactical002`]: PEQ15,
    };

    const rows = fetchOgRowsForBuild({ weaponId: M4A1, attachments, gate: null }, data);
    const build = {
      version: 6 as const,
      weaponId: M4A1,
      attachments: rows.attachments,
      orphaned: [],
      createdAt: "2026-10-16T00:00:00.000Z",
    };
    const card = hydrateBuildCard({ build, weapon: rows.weapon, mods: rows.mods }).stats;

    const weapon = snapshotWeaponList(snapshot, table).find((w) => w.id === M4A1)!;
    const tree = snapshotWeaponTree(snapshot, M4A1);
    const { placed } = resolveBuild(
      tree,
      attachments,
      partsById(snapshotPartCatalog(snapshot, table)),
    );
    // The SOPMOD II already carries one PEQ-15; the build adds two more.
    expect(placed.filter((p) => p.itemId === PEQ15)).toHaveLength(3);
    expect(rows.mods.filter((m) => m.id === PEQ15)).toHaveLength(1);
    const builder = weaponSpec(
      adaptWeapon(weapon),
      placed.map((p) => adaptMod(p.part)),
    );

    expect(card.ergo).toBeCloseTo(builder.ergonomics, 10);
    expect(card.recoilV).toBeCloseTo(builder.verticalRecoil, 10);
    expect(card.recoilH).toBeCloseTo(builder.horizontalRecoil, 10);
    expect(card.accuracy).toBeCloseTo(builder.accuracy, 10);
    // Weight is left out here: the card drops the weapon's own weight (#228).
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
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ ...a.data.snapshot, schema: BUILDER_SNAPSHOT_SCHEMA + 1 })),
        ),
    } as unknown as Fetcher;
    await expect(loadOgData(fetcher, "https://example.com/")).rejects.toThrow(
      "Game data was updated. Reload the page.",
    );
  });
});
