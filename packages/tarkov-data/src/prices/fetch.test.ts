import { describe, expect, it, vi } from "vitest";
import {
  answerPriceRequest,
  fetchPriceTable,
  PRICE_MAX_AGE_MS,
  PriceFetchError,
  type PriceRequest,
} from "./fetch.js";

const ITEMS_URL = "https://json.tarkov.dev/regular/items";
const AS_OF = "2026-10-17T01:38:06.000Z";
const request: PriceRequest = { itemsUrl: ITEMS_URL, ids: ["a"] };

/** A producer-shaped document: the raw envelope, every price field upstream sends. */
const doc = (updated = AS_OF, lastLowPrice: number | null = 900) => ({
  data: {
    items: {
      a: {
        id: "a",
        updated,
        lastLowPrice,
        avg24hPrice: 1200,
        lastOfferCount: 4,
        buyFromTrader: [{ trader: "t", priceRUB: 500, currency: "RUB", minTraderLevel: 1 }],
      },
      b: { id: "b", updated: "2026-10-01T00:00:00.000Z", lastLowPrice: 1 },
    },
  },
  translations: [],
});

const respond = (body: unknown, status = 200, statusText = "OK") =>
  new Response(JSON.stringify(body), { status, statusText });

/** A fetch answering in turn from `answers`, recording each request's cache mode. */
function sequence(...answers: (() => Promise<Response>)[]) {
  const caches: (RequestCache | undefined)[] = [];
  const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    caches.push(init?.cache);
    const next = answers.shift();
    if (next === undefined) throw new Error("unexpected fetch");
    return next();
  }) as unknown as typeof fetch;
  return { fetchImpl, caches };
}

const at = (iso: string) => () => Date.parse(iso);

describe("fetchPriceTable", () => {
  it("reads the asked ids' prices and the document's age, from the HTTP cache when fresh", async () => {
    const { fetchImpl, caches } = sequence(() => Promise.resolve(respond(doc())));
    const prices = await fetchPriceTable(request, { fetchImpl, now: at(AS_OF) });
    expect(prices).toEqual({
      table: { items: { a: [900, 1200, 4] }, trader: { "a|t|1||RUB": 500 } },
      asOf: AS_OF,
    });
    expect(caches).toEqual(["default"]);
  });

  it("refetches with no-cache when the cached document is over an hour old", async () => {
    const fresh = "2026-10-17T03:00:00.000Z";
    const { fetchImpl, caches } = sequence(
      () => Promise.resolve(respond(doc())),
      () => Promise.resolve(respond(doc(fresh, 800))),
    );
    const prices = await fetchPriceTable(request, {
      fetchImpl,
      now: () => Date.parse(AS_OF) + PRICE_MAX_AGE_MS + 1,
    });
    expect(caches).toEqual(["default", "no-cache"]);
    expect(prices.asOf).toBe(fresh);
    expect(prices.table.items.a).toEqual([800, 1200, 4]);
  });

  it("keeps the cached document, with its own age, when the refetch fails", async () => {
    const { fetchImpl } = sequence(
      () => Promise.resolve(respond(doc())),
      () => Promise.reject(new TypeError("Failed to fetch")),
    );
    const prices = await fetchPriceTable(request, { fetchImpl, now: at("2026-10-18T00:00:00Z") });
    expect(prices.asOf).toBe(AS_OF);
  });

  it("names the status when upstream refuses", async () => {
    const { fetchImpl } = sequence(() => Promise.resolve(respond({}, 503, "Service Unavailable")));
    await expect(fetchPriceTable(request, { fetchImpl })).rejects.toThrow(
      new PriceFetchError("json.tarkov.dev answered 503 Service Unavailable"),
    );
  });

  it("rejects a document without an items map, or without a timestamp", async () => {
    for (const body of [null, {}, { data: { items: null } }]) {
      const { fetchImpl } = sequence(() => Promise.resolve(respond(body)));
      await expect(fetchPriceTable(request, { fetchImpl })).rejects.toThrow(
        "The items document has no data.items map",
      );
    }
    const { fetchImpl } = sequence(() => Promise.resolve(respond({ data: { items: { a: {} } } })));
    await expect(fetchPriceTable(request, { fetchImpl })).rejects.toThrow(
      "No item carries an `updated` timestamp",
    );
  });

  it("gives up after the timeout, saying so", async () => {
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted")));
      })) as typeof fetch;
    await expect(fetchPriceTable(request, { fetchImpl, timeoutMs: 5 })).rejects.toThrow(
      "Prices did not arrive within 0.005 s",
    );
  });

  it("passes a network error through unchanged", async () => {
    const { fetchImpl } = sequence(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(fetchPriceTable(request, { fetchImpl })).rejects.toThrow("Failed to fetch");
  });

  it("uses the global fetch and clock when given none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(respond(doc(new Date().toISOString())))),
    );
    try {
      expect((await fetchPriceTable(request)).table.items.a?.[0]).toBe(900);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("answerPriceRequest", () => {
  it("answers with the prices", async () => {
    const { fetchImpl } = sequence(() => Promise.resolve(respond(doc())));
    expect(await answerPriceRequest(request, { fetchImpl, now: at(AS_OF) })).toMatchObject({
      ok: true,
      prices: { asOf: AS_OF },
    });
  });

  it("turns any failure into a message, never a rejection", async () => {
    const refused = sequence(() => Promise.resolve(respond({}, 500, "")));
    expect(await answerPriceRequest(request, { fetchImpl: refused.fetchImpl })).toEqual({
      ok: false,
      message: "json.tarkov.dev answered 500",
    });
    // A fetch implementation may reject with a non-Error; its text still reaches the user.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const thrown = sequence(() => Promise.reject("offline"));
    expect(await answerPriceRequest(request, { fetchImpl: thrown.fetchImpl })).toEqual({
      ok: false,
      message: "offline",
    });
  });
});
