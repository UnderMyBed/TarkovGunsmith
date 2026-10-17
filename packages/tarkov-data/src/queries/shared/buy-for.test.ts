import { describe, expect, it } from "vitest";
import {
  barterCostRUB,
  buyForEntrySchema,
  createOfferCollector,
  createOfferResolver,
  extractPrices,
  fleaPriceFromTuple,
  fleaPriceRUB,
  offerPriceIds,
  priceOffers,
  traderOfferKey,
  type BarterCostItem,
  type BuyForTask,
  type BuyForTrader,
  type UnpricedOffer,
} from "./buy-for.js";
import type { ItemsDocument } from "../documents.js";
import { fixtureClient } from "../../__fixtures__/client.js";
import { fixtureOfferResolver } from "../../__test-utils__/fixture-snapshot.js";

/**
 * One item's own cash and flea offers, priced from its own fields: the resolver with no
 * other documents. Items get an id, since an id-less item cannot be priced and has no offers.
 */
function resolveOwn(item: unknown, traders: readonly BuyForTrader[], tasks: readonly BuyForTask[]) {
  const resolve = createOfferResolver({ items: {}, traders, tasks, barters: [] });
  return resolve(item !== null && typeof item === "object" ? { id: "it", ...item } : item);
}

describe("buyForEntrySchema", () => {
  it("parses a trader offer", () => {
    const parsed = buyForEntrySchema.parse({
      priceRUB: 10000,
      currency: "RUB",
      vendor: {
        __typename: "TraderOffer",
        normalizedName: "prapor",
        minTraderLevel: 2,
        taskUnlock: null,
        trader: { normalizedName: "prapor" },
      },
    });
    expect(parsed.vendor.__typename).toBe("TraderOffer");
  });

  it("parses a flea market offer", () => {
    const parsed = buyForEntrySchema.parse({
      priceRUB: 5000,
      currency: "RUB",
      vendor: {
        __typename: "FleaMarket",
        normalizedName: "flea-market",
        minPlayerLevel: 15,
      },
    });
    expect(parsed.vendor.__typename).toBe("FleaMarket");
  });
});

describe("resolveBuyFor", () => {
  const traders = [{ id: "tr1", name: "Prapor", normalizedName: "prapor" }];
  const tasks = [
    { id: "tk1", name: "Gunsmith - Part 1", normalizedName: "gunsmith-master-part-1" },
  ];

  it("resolves a trader id into the frozen TraderOffer vendor shape", () => {
    const [entry] = resolveOwn(
      {
        types: ["mods"],
        buyFromTrader: [
          { trader: "tr1", priceRUB: 100, currency: "RUB", minTraderLevel: 2, taskUnlock: null },
        ],
      },
      traders,
      tasks,
    );
    expect(entry).toMatchObject({
      priceRUB: 100,
      currency: "RUB",
      vendor: {
        __typename: "TraderOffer",
        normalizedName: "prapor",
        minTraderLevel: 2,
        taskUnlock: null,
        trader: { normalizedName: "prapor" },
      },
    });
  });

  it("resolves a taskUnlock id into its normalizedName", () => {
    const [entry] = resolveOwn(
      {
        types: ["mods"],
        buyFromTrader: [
          { trader: "tr1", priceRUB: 1, currency: "RUB", minTraderLevel: 1, taskUnlock: "tk1" },
        ],
      },
      traders,
      tasks,
    );
    expect(entry?.vendor).toMatchObject({
      taskUnlock: { id: "tk1", normalizedName: "gunsmith-master-part-1" },
    });
  });

  it("emits a flea entry for a flea-tradeable item", () => {
    const entries = resolveOwn(
      { types: ["mods"], buyFromTrader: [], minLevelForFlea: 15, avg24hPrice: 5000 },
      traders,
      tasks,
    );
    expect(entries).toContainEqual({
      priceRUB: 5000,
      currency: "RUB",
      vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 15 },
    });
  });

  it("emits no flea entry for a noFlea item", () => {
    const entries = resolveOwn(
      { types: ["ammo", "noFlea"], buyFromTrader: [], minLevelForFlea: 0 },
      traders,
      tasks,
    );
    expect(entries.every((e) => e.vendor.__typename !== "FleaMarket")).toBe(true);
  });

  it("drops an offer whose trader id is unknown rather than emitting a blank vendor", () => {
    const entries = resolveOwn(
      {
        types: ["mods"],
        buyFromTrader: [
          { trader: "ghost", priceRUB: 1, currency: "RUB", minTraderLevel: 1, taskUnlock: null },
        ],
      },
      traders,
      tasks,
    );
    expect(entries.filter((e) => e.vendor.__typename === "TraderOffer")).toEqual([]);
  });

  it("keeps an unresolvable taskUnlock as null instead of dropping the offer", () => {
    const [entry] = resolveOwn(
      {
        types: ["mods"],
        buyFromTrader: [
          { trader: "tr1", priceRUB: 1, currency: "RUB", minTraderLevel: 1, taskUnlock: "ghost" },
        ],
      },
      traders,
      tasks,
    );
    expect(entry?.vendor).toMatchObject({ taskUnlock: null });
  });
});

describe("resolveBuyFor — defensive edge cases", () => {
  const traders = [{ id: "tr1", name: "Prapor", normalizedName: "prapor" }];
  const tasks = [
    { id: "tk1", name: "Gunsmith - Part 1", normalizedName: "gunsmith-master-part-1" },
  ];

  it("returns [] for a null or non-object item instead of throwing", () => {
    expect(resolveOwn(null, traders, tasks)).toEqual([]);
    expect(resolveOwn("not an item", traders, tasks)).toEqual([]);
  });

  it("ignores a task with a null id when building the taskUnlock lookup", () => {
    // A task with `id: null` must not poison the `Map<string, string>` (it can't be a key
    // anyway) or shadow a real task — `tasks` still resolves `tk1` normally afterward.
    const tasksWithNullId = [{ id: null, normalizedName: "orphan-task" }, ...tasks];
    const [entry] = resolveOwn(
      {
        types: ["mods"],
        buyFromTrader: [
          { trader: "tr1", priceRUB: 1, currency: "RUB", minTraderLevel: 1, taskUnlock: "tk1" },
        ],
      },
      traders,
      tasksWithNullId,
    );
    expect(entry?.vendor).toMatchObject({
      taskUnlock: { id: "tk1", normalizedName: "gunsmith-master-part-1" },
    });
  });

  it("treats a missing buyFromTrader field as no trader offers", () => {
    const entries = resolveOwn({ types: ["mods"] }, traders, tasks);
    expect(entries.filter((e) => e.vendor.__typename === "TraderOffer")).toEqual([]);
  });

  it("skips a null or non-object entry inside buyFromTrader", () => {
    const entries = resolveOwn(
      { types: ["mods"], buyFromTrader: [null, "not an offer"] },
      traders,
      tasks,
    );
    expect(entries.filter((e) => e.vendor.__typename === "TraderOffer")).toEqual([]);
  });

  it("drops a buyFromTrader entry whose trader field isn't a string", () => {
    const entries = resolveOwn(
      { types: ["mods"], buyFromTrader: [{ trader: 12345 }] },
      traders,
      tasks,
    );
    expect(entries.filter((e) => e.vendor.__typename === "TraderOffer")).toEqual([]);
  });

  it("defaults priceRUB, currency and minTraderLevel to null when absent or mistyped", () => {
    const [entry] = resolveOwn(
      {
        types: ["mods"],
        buyFromTrader: [{ trader: "tr1", priceRUB: "free", currency: 5, minTraderLevel: "one" }],
      },
      traders,
      tasks,
    );
    expect(entry).toMatchObject({
      priceRUB: null,
      currency: null,
      vendor: { minTraderLevel: null },
    });
  });

  it("treats a missing `types` list as not noFlea, still emitting a flea entry", () => {
    const entries = resolveOwn({ buyFromTrader: [] }, traders, tasks);
    expect(entries.some((e) => e.vendor.__typename === "FleaMarket")).toBe(true);
  });

  it("falls back to lastLowPrice for the flea entry when avg24hPrice is absent", () => {
    const entries = resolveOwn(
      { types: ["mods"], buyFromTrader: [], lastLowPrice: 777 },
      traders,
      tasks,
    );
    const flea = entries.find((e) => e.vendor.__typename === "FleaMarket");
    expect(flea?.priceRUB).toBe(777);
  });
});

describe("fleaPriceRUB", () => {
  it("prefers avg24hPrice, falls back to lastLowPrice, and is null when neither exists", () => {
    expect(fleaPriceRUB({ avg24hPrice: 19126, lastLowPrice: 13555 })).toBe(19126);
    expect(fleaPriceRUB({ lastLowPrice: 13555 })).toBe(13555);
    expect(fleaPriceRUB({})).toBeNull();
    expect(fleaPriceRUB(null)).toBeNull();
  });
});

describe("barterCostRUB", () => {
  const prices: Record<string, BarterCostItem> = {
    cpu: { name: "PC CPU", fleaPriceRUB: 19126 },
    fan: { name: "CPU fan", fleaPriceRUB: 18504 },
    gp: { name: "GP coin", fleaPriceRUB: null },
  };
  const lookup = (id: string) => prices[id];
  const line = (item: string, count: number) => ({ item, count, attributes: {} });

  it("sums count × flea price over the required items", () => {
    // The live M4A1 Carbine preset barter: 3 PC CPU + 1 CPU fan.
    const cost = barterCostRUB(
      { requiredItems: [line("cpu", 3), line("fan", 1)], offeredItem: line("m4", 1) },
      lookup,
    );
    expect(cost).toEqual({ priceRUB: 3 * 19126 + 18504, reason: null });
  });

  it("prices per unit received when a barter hands over a stack", () => {
    const cost = barterCostRUB(
      { requiredItems: [line("fan", 1)], offeredItem: line("ammo", 20) },
      lookup,
    );
    expect(cost).toEqual({ priceRUB: Math.round(18504 / 20), reason: null });
  });

  it("is null with a named reason when a required item has no flea price", () => {
    const cost = barterCostRUB(
      { requiredItems: [line("cpu", 1), line("gp", 6.25)], offeredItem: line("stock", 1) },
      lookup,
    );
    expect(cost).toEqual({ priceRUB: null, reason: "GP coin has no flea price" });
  });

  it("is null with a reason when a required item is not in the items document", () => {
    const cost = barterCostRUB(
      { requiredItems: [line("ghost", 1)], offeredItem: line("stock", 1) },
      lookup,
    );
    expect(cost.priceRUB).toBeNull();
    expect(cost.reason).toBe("required item ghost is not in the items document");
  });
});

describe("createOfferResolver (captured documents)", () => {
  const PM = "5448bd6b4bdc2dfc2f8b4569";
  const M4A1 = "5447a9cd4bdc2dbd208b4567";
  const RAVAGE = "6984b82c5aab442620032fe8";

  async function setup() {
    const client = fixtureClient();
    const [doc, resolve] = await Promise.all([
      client.fetchResource<ItemsDocument>("items"),
      fixtureOfferResolver(client),
    ]);
    return { items: doc.items, resolve };
  }

  it("gives a bare receiver its presets' cash offers and barters, tagged with the preset", async () => {
    const { items, resolve } = await setup();
    const offers = resolve(items[PM]);
    // The bare PM has no trader offer of its own; Prapor sells it as the default preset.
    expect(offers).toContainEqual({
      priceRUB: 12631,
      currency: "RUB",
      vendor: {
        __typename: "TraderOffer",
        normalizedName: "prapor",
        minTraderLevel: 1,
        taskUnlock: null,
        trader: { normalizedName: "prapor" },
      },
      preset: {
        id: "58414967245977598f1ad391",
        normalizedName: "makarov-pm-9x18pm-pistol-default",
      },
    });
    const barter = offers.find((o) => o.vendor.__typename === "TraderBarter");
    expect(barter).toMatchObject({
      priceRUB: 18944,
      currency: null,
      vendor: { barterId: "6ad1e5d8ef48f022220a28931", minTraderLevel: 1, offeredCount: 1 },
      preset: { id: "58414967245977598f1ad391" },
    });
    // Its own flea entry survives; the preset's flea listing is not added.
    expect(offers.filter((o) => o.vendor.__typename === "FleaMarket")).toHaveLength(1);
  });

  it("values a preset barter from its required items' flea prices", async () => {
    const { items, resolve } = await setup();
    const carbine = resolve(items[M4A1]).find(
      (o) =>
        o.vendor.__typename === "TraderBarter" && o.vendor.barterId === "6ad1e61cef48f022220a4ec81",
    );
    expect(carbine).toMatchObject({
      priceRUB: 3 * 19126 + 18504,
      vendor: { normalizedName: "peacekeeper", minTraderLevel: 2, costUnavailableReason: null },
      preset: { id: "5af08cf886f774223c269184" },
    });
  });

  it("keeps a barter from a trader outside the profile, with an unpriced cost and its reason", async () => {
    const { items, resolve } = await setup();
    expect(resolve(items[RAVAGE])).toEqual([
      {
        priceRUB: null,
        currency: null,
        vendor: {
          __typename: "TraderBarter",
          normalizedName: "ref",
          minTraderLevel: 3,
          taskUnlock: null,
          trader: { normalizedName: "ref" },
          barterId: "6ad1e5efef48f022220a37e63",
          offeredCount: 1,
          requiredItems: [{ itemId: "5d235b4d86f7742e017bc88a", count: 6.25, attributes: {} }],
          costUnavailableReason: "GP coin has no flea price",
        },
      },
    ]);
  });

  it("returns [] for a non-object item", async () => {
    const { resolve } = await setup();
    expect(resolve(null)).toEqual([]);
    expect(resolve("x")).toEqual([]);
  });

  it("drops a barter whose trader id resolves to nothing", () => {
    const resolve = createOfferResolver({
      items: { a: { id: "a", types: ["noFlea"] } },
      traders: [],
      tasks: [],
      barters: [
        {
          id: "b",
          trader: "unknown",
          taskUnlock: null,
          minTraderLevel: 1,
          requiredItems: [],
          offeredItem: { item: "a", count: 1, attributes: {} },
        },
      ],
    });
    expect(resolve({ id: "a", types: ["noFlea"] })).toEqual([]);
  });
});

describe("createOfferResolver — malformed records", () => {
  // The resolver reads unvalidated upstream documents (and, under #211, a snapshot built from
  // them). A malformed record must neither throw nor invent an offer.
  const traders = [{ id: "tr-mech", normalizedName: "mechanic" }];
  const barter = (id: string, offered: string, required: string) => ({
    id,
    trader: "tr-mech",
    taskUnlock: null,
    minTraderLevel: 2,
    requiredItems: [{ item: required, count: 2, attributes: {} }],
    offeredItem: { item: offered, count: 1, attributes: {} },
  });

  it("skips non-object items and presets without a usable baseItem or name", () => {
    const resolve = createOfferResolver({
      items: {
        gun: { id: "gun", types: ["gun", "noFlea"] },
        hole: null,
        "preset-no-base": {
          id: "preset-no-base",
          normalizedName: "gun-default",
          properties: { propertiesType: "ItemPropertiesPreset", baseItem: null },
        },
        "preset-no-name": {
          id: "preset-no-name",
          properties: { propertiesType: "ItemPropertiesPreset", baseItem: "gun" },
        },
      },
      traders,
      tasks: [],
      barters: [barter("b1", "preset-no-name", "gun")],
    });
    expect(resolve({ id: "gun", types: ["gun", "noFlea"] })).toEqual([]);
  });

  it("names a barter ingredient by id when its record carries no name", () => {
    const resolve = createOfferResolver({
      items: {
        stock: { id: "stock", types: ["mods", "noFlea"] },
        bolts: { id: "bolts", types: ["barter"] },
      },
      traders,
      tasks: [],
      barters: [barter("b2", "stock", "bolts")],
    });
    const [entry] = resolve({ id: "stock", types: ["mods", "noFlea"] });
    expect(entry?.priceRUB).toBeNull();
    expect(entry?.vendor).toMatchObject({ costUnavailableReason: "bolts has no flea price" });
  });

  it("leaves a barter unpriced when an input is not in the items document", () => {
    const resolve = createOfferResolver({
      items: { stock: { id: "stock", types: ["mods", "noFlea"] } },
      traders,
      tasks: [],
      barters: [barter("b3", "stock", "ghost")],
    });
    const [entry] = resolve({ id: "stock", types: ["mods", "noFlea"] });
    expect(entry?.vendor).toMatchObject({
      costUnavailableReason: "required item ghost is not in the items document",
    });
  });

  it("gives an item without an id no offers, since nothing could price them", () => {
    const resolve = createOfferResolver({ items: {}, traders, tasks: [], barters: [] });
    const entries = resolve({
      types: ["mods"],
      buyFromTrader: [{ trader: "tr-mech", priceRUB: 5000, currency: "RUB", minTraderLevel: 1 }],
    });
    expect(entries).toEqual([]);
  });
});

describe("traderOfferKey", () => {
  it("joins seller, trader, level, quest gate and currency", () => {
    expect(
      traderOfferKey("item", {
        trader: "tr",
        minTraderLevel: 2,
        taskUnlock: "task",
        currency: "USD",
        priceRUB: 1,
      }),
    ).toBe("item|tr|2|task|USD");
  });

  it("leaves absent or non-scalar fields empty", () => {
    expect(traderOfferKey("item", { trader: "tr", taskUnlock: null, currency: {} })).toBe(
      "item|tr|||",
    );
    expect(traderOfferKey("item", null)).toBe("item||||");
  });
});

describe("extractPrices", () => {
  const offer = (priceRUB: unknown) => ({
    trader: "tr",
    minTraderLevel: 1,
    taskUnlock: null,
    currency: "RUB",
    priceRUB,
  });

  it("reads flea fields and keyed trader prices for the ids asked for", () => {
    const items: Record<string, unknown> = {
      a: { lastLowPrice: 10, avg24hPrice: 12, lastOfferCount: 3, buyFromTrader: [offer(500)] },
      b: { avg24hPrice: "n/a", buyFromTrader: "none" },
      unasked: { lastLowPrice: 1 },
    };
    const { table, conflicts } = extractPrices((id) => items[id], ["a", "b", "missing"]);
    expect(table.items).toEqual({ a: [10, 12, 3], b: [null, null, null] });
    expect(table.trader).toEqual({ "a|tr|1||RUB": 500 });
    expect(conflicts).toEqual([]);
  });

  it("shares one price between exact duplicates, and skips malformed offers", () => {
    const items: Record<string, unknown> = {
      a: { buyFromTrader: [offer(500), offer(500), null, "x"] },
    };
    const { table, conflicts } = extractPrices((id) => items[id], ["a"]);
    expect(table.trader).toEqual({ "a|tr|1||RUB": 500 });
    expect(conflicts).toEqual([]);
  });

  it("prices an ambiguous key null, keeps it null, and reports it", () => {
    const items: Record<string, unknown> = {
      a: { buyFromTrader: [offer(500), offer(600), offer(500)] },
    };
    const { table, conflicts } = extractPrices((id) => items[id], ["a"]);
    expect(table.trader["a|tr|1||RUB"]).toBeNull();
    expect(conflicts).toEqual(["a|tr|1||RUB"]);
  });
});

describe("fleaPriceFromTuple", () => {
  it("prefers avg24hPrice, and is null for an item the table does not hold", () => {
    expect(fleaPriceFromTuple(undefined)).toBeNull();
    expect(fleaPriceFromTuple([5, null, 1])).toBe(5);
    expect(fleaPriceFromTuple([5, 7, 1])).toBe(7);
  });
});

describe("offerPriceIds / priceOffers", () => {
  const cash: UnpricedOffer = {
    kind: "cash",
    priceKey: "preset|tr|1||RUB",
    currency: "RUB",
    vendor: {
      __typename: "TraderOffer",
      normalizedName: "prapor",
      minTraderLevel: 1,
      taskUnlock: null,
      trader: { normalizedName: "prapor" },
    },
    preset: { id: "preset", normalizedName: "gun-default" },
  };
  const barter: UnpricedOffer = {
    kind: "barter",
    vendor: {
      __typename: "TraderBarter",
      normalizedName: "prapor",
      minTraderLevel: 1,
      taskUnlock: null,
      trader: { normalizedName: "prapor" },
      barterId: "b",
      offeredCount: 2,
      requiredItems: [{ itemId: "nuts", count: 3, attributes: {} }],
    },
  };
  const flea: UnpricedOffer = {
    kind: "flea",
    vendor: { __typename: "FleaMarket", normalizedName: "flea-market", minPlayerLevel: 15 },
  };

  it("lists the item, its selling presets and its barter inputs", () => {
    expect(offerPriceIds("gun", [cash, barter, flea]).sort()).toEqual(["gun", "nuts", "preset"]);
  });

  it("prices each offer from the table, and leaves a missing price null", () => {
    const priced = priceOffers(
      "gun",
      [cash, barter, flea],
      { items: { gun: [900, null, 4], nuts: [100, null, 9] }, trader: {} },
      (id) => (id === "nuts" ? "Nuts" : undefined),
    );
    expect(priced).toEqual([
      { priceRUB: null, currency: "RUB", vendor: cash.vendor, preset: cash.preset },
      { priceRUB: 150, currency: null, vendor: { ...barter.vendor, costUnavailableReason: null } },
      { priceRUB: 900, currency: "RUB", vendor: flea.vendor },
    ]);
  });

  it("collects nothing for a non-object item", () => {
    const collect = createOfferCollector({ items: {}, traders: [], tasks: [], barters: [] });
    expect(collect(null)).toEqual([]);
  });
});
