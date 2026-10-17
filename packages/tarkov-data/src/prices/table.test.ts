import { describe, expect, it } from "vitest";
import {
  extractPrices,
  fleaPriceFromTuple,
  newestUpdated,
  priceTupleOf,
  traderOfferKey,
} from "./table.js";

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
  it("is lastLowPrice, never avg24hPrice, and null for an item the table does not hold", () => {
    expect(fleaPriceFromTuple(undefined)).toBeNull();
    expect(fleaPriceFromTuple([5, null, 1])).toBe(5);
    expect(fleaPriceFromTuple([5, 7, 1])).toBe(5);
    expect(fleaPriceFromTuple([null, 7, 2])).toBeNull();
  });
});

describe("priceTupleOf", () => {
  it("keeps numbers and turns anything else into null", () => {
    expect(priceTupleOf({ lastLowPrice: 1, avg24hPrice: "2", lastOfferCount: 3 })).toEqual([
      1,
      null,
      3,
    ]);
  });
});

describe("newestUpdated", () => {
  it("is the newest parseable `updated`, as ISO 8601", () => {
    expect(
      newestUpdated({
        a: { updated: "2026-10-17T01:38:06.000Z" },
        b: { updated: "2026-10-17T01:50:00Z" },
        c: { updated: "not a date" },
        d: null,
        e: {},
      }),
    ).toBe("2026-10-17T01:50:00.000Z");
  });

  it("is null when no item carries one", () => {
    expect(newestUpdated({ a: {}, b: null })).toBeNull();
    expect(newestUpdated({})).toBeNull();
  });
});
