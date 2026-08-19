import { describe, expect, it } from "vitest";
import { buyForEntrySchema, resolveBuyFor } from "./buy-for.js";

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
