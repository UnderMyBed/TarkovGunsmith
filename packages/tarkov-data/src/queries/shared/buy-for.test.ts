import { describe, expect, it } from "vitest";
import {
  barterCostRUB,
  buyForEntrySchema,
  createOfferResolver,
  fleaPriceRUB,
  resolveBuyFor,
  type BarterCostItem,
} from "./buy-for.js";
import { fetchOfferResolver } from "../barters.js";
import { fetchTraders } from "../traders.js";
import { fetchTasks } from "../tasks.js";
import type { ItemsDocument } from "../documents.js";
import { fixtureClient } from "../../__fixtures__/client.js";

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
    const [entry] = resolveBuyFor(
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
    const [entry] = resolveBuyFor(
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
    const entries = resolveBuyFor(
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
    const entries = resolveBuyFor(
      { types: ["ammo", "noFlea"], buyFromTrader: [], minLevelForFlea: 0 },
      traders,
      tasks,
    );
    expect(entries.every((e) => e.vendor.__typename !== "FleaMarket")).toBe(true);
  });

  it("drops an offer whose trader id is unknown rather than emitting a blank vendor", () => {
    const entries = resolveBuyFor(
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
    const [entry] = resolveBuyFor(
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
    expect(resolveBuyFor(null, traders, tasks)).toEqual([]);
    expect(resolveBuyFor("not an item", traders, tasks)).toEqual([]);
  });

  it("ignores a task with a null id when building the taskUnlock lookup", () => {
    // A task with `id: null` must not poison the `Map<string, string>` (it can't be a key
    // anyway) or shadow a real task — `tasks` still resolves `tk1` normally afterward.
    const tasksWithNullId = [{ id: null, normalizedName: "orphan-task" }, ...tasks];
    const [entry] = resolveBuyFor(
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
    const entries = resolveBuyFor({ types: ["mods"] }, traders, tasks);
    expect(entries.filter((e) => e.vendor.__typename === "TraderOffer")).toEqual([]);
  });

  it("skips a null or non-object entry inside buyFromTrader", () => {
    const entries = resolveBuyFor(
      { types: ["mods"], buyFromTrader: [null, "not an offer"] },
      traders,
      tasks,
    );
    expect(entries.filter((e) => e.vendor.__typename === "TraderOffer")).toEqual([]);
  });

  it("drops a buyFromTrader entry whose trader field isn't a string", () => {
    const entries = resolveBuyFor(
      { types: ["mods"], buyFromTrader: [{ trader: 12345 }] },
      traders,
      tasks,
    );
    expect(entries.filter((e) => e.vendor.__typename === "TraderOffer")).toEqual([]);
  });

  it("defaults priceRUB, currency and minTraderLevel to null when absent or mistyped", () => {
    const [entry] = resolveBuyFor(
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
    const entries = resolveBuyFor({ buyFromTrader: [] }, traders, tasks);
    expect(entries.some((e) => e.vendor.__typename === "FleaMarket")).toBe(true);
  });

  it("falls back to lastLowPrice for the flea entry when avg24hPrice is absent", () => {
    const entries = resolveBuyFor(
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
      fetchOfferResolver(client),
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

  it("leaves resolveBuyFor at cash + flea only", async () => {
    const { items } = await setup();
    const client = fixtureClient();
    const [traders, tasks] = await Promise.all([fetchTraders(client), fetchTasks(client)]);
    const types = resolveBuyFor(items[PM], traders, tasks).map((o) => o.vendor.__typename);
    expect(types).toEqual(["FleaMarket"]);
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
