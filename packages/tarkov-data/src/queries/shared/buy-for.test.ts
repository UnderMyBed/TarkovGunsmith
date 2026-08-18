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
