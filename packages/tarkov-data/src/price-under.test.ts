import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, type PlayerProfile } from "./build-schema.js";
import {
  buildPriceUnder,
  builderMode,
  priceGate,
  priceUnder,
  weaponPaths,
  type PricedPart,
} from "./price-under.js";
import type { BuyForEntry, OfferPreset } from "./queries/shared/buy-for.js";

const LL4: PlayerProfile = {
  mode: "basic",
  traders: { prapor: 4, therapist: 4, skier: 4, peacekeeper: 4, mechanic: 4, ragman: 4, jaeger: 4 },
  flea: true,
  level: 40,
};

const cash = (
  trader: string,
  level: number,
  priceRUB: number | null,
  preset?: OfferPreset,
): BuyForEntry => ({
  priceRUB,
  currency: "RUB",
  vendor: {
    __typename: "TraderOffer",
    normalizedName: trader,
    minTraderLevel: level,
    taskUnlock: null,
    trader: { normalizedName: trader },
  },
  ...(preset === undefined ? {} : { preset }),
});

const flea = (priceRUB: number | null, unlisted = false): BuyForEntry => ({
  priceRUB,
  currency: "RUB",
  vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 15 },
  ...(unlisted ? { unlisted: true as const } : {}),
});

const part = (id: string, ...buyFor: BuyForEntry[]): PricedPart => ({
  id,
  buyFor,
  types: ["mods"],
});

const DEFAULT: OfferPreset = { id: "p-default", normalizedName: "gun-default" };
const FANCY: OfferPreset = { id: "p-fancy", normalizedName: "gun-fancy" };

describe("builderMode / priceGate", () => {
  it("maps Show all to theorycraft, and theorycraft to no gate", () => {
    expect(builderMode(true)).toBe("theorycraft");
    expect(builderMode(false)).toBe("progression");
    expect(priceGate("theorycraft", LL4)).toBeNull();
    expect(priceGate("progression", LL4)).toBe(LL4);
  });
});

describe("priceUnder", () => {
  it("is the cheapest path the gate can use", () => {
    const item = part("a", cash("prapor", 1, 900), flea(500));
    expect(priceUnder(LL4, item)).toBe(500);
    expect(priceUnder(DEFAULT_PROFILE, item)).toBe(900);
  });

  it("is null when no path is open, an unlisted flea entry included", () => {
    expect(priceUnder(DEFAULT_PROFILE, part("a", flea(500)))).toBeNull();
    expect(priceUnder(LL4, part("a", flea(null, true)))).toBeNull();
    expect(priceUnder(null, part("a", flea(null, true)))).toBeNull();
  });

  it("is null, never 0, when the open path's price is unknown", () => {
    expect(priceUnder(LL4, part("a", cash("prapor", 1, null)))).toBeNull();
  });
});

describe("weaponPaths", () => {
  const weapon = {
    id: "gun",
    types: ["gun"],
    buyFor: [
      cash("mechanic", 3, 50_000),
      cash("prapor", 1, 60_000, DEFAULT),
      cash("skier", 4, 58_000, DEFAULT),
      flea(45_000),
    ],
  };

  it("lists the receiver's own path and each open preset path", () => {
    const paths = weaponPaths(LL4, weapon, [
      { id: DEFAULT.id, attachments: { a: "stock", b: "grip", c: "stock" } },
    ]);
    expect(paths.map((p) => [p.presetId, p.availability.priceRUB])).toEqual([
      [null, 45_000],
      [DEFAULT.id, 58_000],
    ]);
    expect(paths[0]?.covers.size).toBe(0);
    expect([...(paths[1]?.covers ?? [])]).toEqual([
      ["stock", 2],
      ["grip", 1],
    ]);
  });

  it("leaves out paths the gate cannot use, and a preset with no contents covers nothing", () => {
    const paths = weaponPaths(DEFAULT_PROFILE, weapon);
    expect(paths.map((p) => p.presetId)).toEqual([DEFAULT.id]);
    expect(paths[0]?.covers.size).toBe(0);
  });

  it("adds a preset's own offers, such as its flea listing", () => {
    const paths = weaponPaths(LL4, { id: "gun", types: [], buyFor: null }, [
      { id: FANCY.id, attachments: {}, buyFor: [flea(70_000)] },
      { id: "p-none", attachments: {} },
    ]);
    expect(paths.map((p) => [p.presetId, p.availability.priceRUB])).toEqual([[FANCY.id, 70_000]]);
  });
});

describe("buildPriceUnder", () => {
  const stock = part("stock", cash("prapor", 1, 8_000));
  const grip = part("grip", cash("prapor", 1, 2_000));
  const weapon = {
    id: "gun",
    types: ["gun"],
    buyFor: [cash("mechanic", 1, 50_000), cash("prapor", 1, 55_000, DEFAULT)],
  };
  const presets = [{ id: DEFAULT.id, attachments: { s: "stock", g: "grip" } }];

  it("adds the weapon to the parts", () => {
    expect(buildPriceUnder(LL4, { weapon, parts: [stock, grip] })).toEqual({
      status: "priced",
      totalRUB: 60_000,
      presetId: null,
    });
  });

  it("does not charge again for the parts a bought preset comes with", () => {
    expect(buildPriceUnder(LL4, { weapon, parts: [stock, grip], presets })).toEqual({
      status: "priced",
      totalRUB: 55_000,
      presetId: DEFAULT.id,
    });
    // A preset supplies one of each: a second stock is paid for.
    expect(buildPriceUnder(LL4, { weapon, parts: [stock, stock, grip], presets })).toEqual({
      status: "priced",
      totalRUB: 63_000,
      presetId: DEFAULT.id,
    });
  });

  it("prefers the receiver on an exact tie, then the lower preset id", () => {
    const tie = {
      id: "gun",
      types: [],
      buyFor: [
        cash("mechanic", 1, 50_000),
        cash("prapor", 1, 50_000, FANCY),
        cash("prapor", 1, 50_000, DEFAULT),
      ],
    };
    expect(buildPriceUnder(LL4, { weapon: tie, parts: [] })).toMatchObject({ presetId: null });
    const presetsOnly = { ...tie, buyFor: tie.buyFor.slice(1) };
    expect(buildPriceUnder(LL4, { weapon: presetsOnly, parts: [] })).toMatchObject({
      presetId: DEFAULT.id,
    });
  });

  it("is unknown, never a smaller total, when a price on the path is not known", () => {
    const unpricedGrip = part("grip", cash("prapor", 1, null));
    expect(buildPriceUnder(LL4, { weapon, parts: [stock, unpricedGrip] })).toEqual({
      status: "unknown",
      knownRUB: 58_000,
      unpriced: ["grip"],
      presetId: null,
    });
    const unpricedGun = { ...weapon, buyFor: [cash("mechanic", 1, null)] };
    expect(buildPriceUnder(LL4, { weapon: unpricedGun, parts: [stock] })).toEqual({
      status: "unknown",
      knownRUB: 8_000,
      unpriced: ["gun"],
      presetId: null,
    });
  });

  it("prefers a fully priced path to a cheaper-looking one with an unknown price", () => {
    const unpricedGrip = part("grip", cash("prapor", 1, null));
    expect(buildPriceUnder(LL4, { weapon, parts: [stock, unpricedGrip], presets })).toEqual({
      status: "priced",
      totalRUB: 55_000,
      presetId: DEFAULT.id,
    });
  });

  it("is unobtainable when no path buys the weapon", () => {
    const locked = { ...weapon, buyFor: [cash("mechanic", 4, 1)] };
    expect(buildPriceUnder(DEFAULT_PROFILE, { weapon: locked, parts: [] })).toEqual({
      status: "unobtainable",
      missing: ["gun"],
    });
  });

  it("names the parts no path can get, from the path missing fewest", () => {
    const lockedStock = part("stock", cash("prapor", 4, 1));
    const lockedGrip = part("grip", flea(null, true));
    expect(buildPriceUnder(DEFAULT_PROFILE, { weapon, parts: [lockedStock, lockedGrip] })).toEqual({
      status: "unobtainable",
      missing: ["stock", "grip"],
    });
    // The preset supplies the stock, so only the grip is still missing.
    expect(
      buildPriceUnder(DEFAULT_PROFILE, {
        weapon,
        parts: [lockedStock, lockedGrip],
        presets: [{ id: DEFAULT.id, attachments: { s: "stock" } }],
      }),
    ).toEqual({ status: "unobtainable", missing: ["grip"] });
  });

  it("gets a part through the preset that supplies it, even when the gate could not buy it", () => {
    const lockedStock = part("stock", cash("prapor", 4, 1));
    expect(
      buildPriceUnder(DEFAULT_PROFILE, {
        weapon,
        parts: [lockedStock],
        presets: [{ id: DEFAULT.id, attachments: { s: "stock" } }],
      }),
    ).toEqual({ status: "priced", totalRUB: 55_000, presetId: DEFAULT.id });
  });
});
