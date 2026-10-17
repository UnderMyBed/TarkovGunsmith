import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureSnapshot } from "../__test-utils__/fixture-snapshot.js";
import itemsCapture from "../__fixtures__/items-sample.json" with { type: "json" };
import { PriceFetchError, type PriceReply, type PriceRequest } from "../prices/fetch.js";
import {
  createBuilderDataSource,
  requestPricesFromWorker,
  staticBuilderDataSource,
  type PriceWorker,
} from "./source.js";

const SNAPSHOT_URL = "/data/builder-snapshot.json";
const ITEMS_URL = "https://json.tarkov.dev/regular/items";

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, statusText: status === 200 ? "OK" : "Nope" });

/** A fetch that answers the snapshot and the raw items document, counting each. */
async function fakeUpstream() {
  const { snapshot, prices } = await fixtureSnapshot();
  const calls: string[] = [];
  let snapshotStatus = 200;
  let itemsBody: unknown = itemsCapture.document;
  let itemsStatus = 200;
  const fetchImpl = vi.fn((input: RequestInfo | URL) => {
    const url = urlOf(input);
    calls.push(url);
    if (url === SNAPSHOT_URL) return Promise.resolve(json(snapshot, snapshotStatus));
    return Promise.resolve(json(itemsBody, itemsStatus));
  }) as unknown as typeof fetch;
  return {
    snapshot,
    prices,
    calls,
    fetchImpl,
    failSnapshot: (status: number) => (snapshotStatus = status),
    setItems: (body: unknown, status = 200) => {
      itemsBody = body;
      itemsStatus = status;
    },
  };
}

// The captured document is current at its own `asOf`, so one price load is one request.
beforeEach(async () => {
  const { prices } = await fixtureSnapshot();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(prices.dataAsOf));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const live = (prices: { prices: unknown; dataAsOf: string }) => ({
  table: prices.prices,
  asOf: prices.dataAsOf,
});

describe("createBuilderDataSource", () => {
  it("loads the snapshot once and prices from the raw items document", async () => {
    const up = await fakeUpstream();
    const source = createBuilderDataSource({
      snapshotUrl: SNAPSHOT_URL,
      itemsUrl: ITEMS_URL,
      fetchImpl: up.fetchImpl,
    });
    expect(await source.snapshot()).toEqual(up.snapshot);
    expect(await source.snapshot()).toEqual(up.snapshot);
    // The items capture is the untranslated envelope, and no price field is translated, so
    // the live path prices exactly what the generator priced.
    expect(await source.prices()).toEqual(live(up.prices));
    await source.prices();
    expect(up.calls).toEqual([SNAPSHOT_URL, ITEMS_URL]);
  });

  it("refetches prices once their time is up", async () => {
    const up = await fakeUpstream();
    const source = createBuilderDataSource({
      snapshotUrl: SNAPSHOT_URL,
      itemsUrl: ITEMS_URL,
      fetchImpl: up.fetchImpl,
      priceTtlMs: 0,
    });
    await source.prices();
    await source.prices();
    expect(up.calls.filter((u) => u === ITEMS_URL)).toHaveLength(2);
  });

  it("fails a snapshot load loudly and retries it next time", async () => {
    const up = await fakeUpstream();
    const source = createBuilderDataSource({
      snapshotUrl: SNAPSHOT_URL,
      itemsUrl: ITEMS_URL,
      fetchImpl: up.fetchImpl,
    });
    up.failSnapshot(404);
    await expect(source.snapshot()).rejects.toThrow("Failed to load game data: 404 Nope");
    up.failSnapshot(200);
    expect(await source.snapshot()).toEqual(up.snapshot);
  });

  it("fails a price fetch loudly, and does not keep the failure", async () => {
    const up = await fakeUpstream();
    const source = createBuilderDataSource({
      snapshotUrl: SNAPSHOT_URL,
      itemsUrl: ITEMS_URL,
      fetchImpl: up.fetchImpl,
    });
    up.setItems({}, 503);
    await expect(source.prices()).rejects.toBeInstanceOf(PriceFetchError);
    up.setItems({ data: {} });
    await expect(source.prices()).rejects.toThrow("The items document has no data.items map");
    up.setItems(null);
    await expect(source.prices()).rejects.toThrow("no data.items map");
    up.setItems(itemsCapture.document);
    expect(await source.prices()).toEqual(live(up.prices));
  });

  it("keeps a newer price load when an older one fails after it", async () => {
    const up = await fakeUpstream();
    let rejectFirst: (error: Error) => void = () => {};
    let first = true;
    const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (urlOf(input) === ITEMS_URL && first) {
        first = false;
        return new Promise<Response>((_, reject) => (rejectFirst = reject));
      }
      return up.fetchImpl(input, init);
    }) as typeof fetch;
    const source = createBuilderDataSource({
      snapshotUrl: SNAPSHOT_URL,
      itemsUrl: ITEMS_URL,
      fetchImpl,
      priceTtlMs: 0,
    });
    const older = source.prices();
    await source.snapshot();
    await vi.waitFor(() => expect(first).toBe(false));
    const newer = source.prices();
    rejectFirst(new Error("slow and failed"));
    await expect(older).rejects.toThrow("slow and failed");
    expect(await newer).toEqual(live(up.prices));
  });

  it("uses the global fetch when given none", async () => {
    const up = await fakeUpstream();
    vi.stubGlobal("fetch", up.fetchImpl);
    const source = createBuilderDataSource({ snapshotUrl: SNAPSHOT_URL, itemsUrl: ITEMS_URL });
    expect(await source.snapshot()).toEqual(up.snapshot);
  });
});

describe("staticBuilderDataSource", () => {
  it("hands back what it was given", async () => {
    const { snapshot, prices } = await fixtureSnapshot();
    const source = staticBuilderDataSource(snapshot, prices);
    expect(await source.snapshot()).toBe(snapshot);
    expect(await source.prices()).toEqual({ table: prices.prices, asOf: prices.dataAsOf });
  });
});

/** A stand-in Worker: records what it was sent and lets the test answer. */
function fakeWorker() {
  const sent: PriceRequest[] = [];
  let terminated = 0;
  const worker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (request: PriceRequest) => sent.push(request),
    terminate: () => void terminated++,
  } as unknown as PriceWorker;
  return {
    worker,
    sent,
    terminated: () => terminated,
    reply: (data: PriceReply) => {
      worker.onmessage?.call(worker as Worker, { data } as MessageEvent<PriceReply>);
    },
    fail: (message: string) => {
      worker.onerror?.call(worker as Worker, { message } as ErrorEvent);
    },
    garble: () => {
      worker.onmessageerror?.call(worker as Worker, {} as MessageEvent);
    },
  };
}

describe("requestPricesFromWorker", () => {
  const request: PriceRequest = { itemsUrl: ITEMS_URL, ids: ["a"] };
  const prices = {
    table: { items: { a: [1, 2, 3] as const }, trader: {} },
    asOf: "2026-10-17T00:00:00.000Z",
  };

  it("posts the request, resolves the reply, and terminates the worker", async () => {
    const w = fakeWorker();
    const pending = requestPricesFromWorker(() => w.worker, request);
    expect(w.sent).toEqual([request]);
    w.reply({ ok: true, prices });
    expect(await pending).toEqual(prices);
    expect(w.terminated()).toBe(1);
  });

  it("rejects with the worker's own message when it could not read prices", async () => {
    const w = fakeWorker();
    const pending = requestPricesFromWorker(() => w.worker, request);
    w.reply({ ok: false, message: "json.tarkov.dev answered 503 Service Unavailable" });
    await expect(pending).rejects.toThrow(
      new PriceFetchError("json.tarkov.dev answered 503 Service Unavailable"),
    );
    expect(w.terminated()).toBe(1);
  });

  it("rejects when the worker fails, rather than fetching on the main thread", async () => {
    const w = fakeWorker();
    const pending = requestPricesFromWorker(() => w.worker, request);
    w.fail("SyntaxError: bad bundle");
    await expect(pending).rejects.toThrow("The price worker failed: SyntaxError: bad bundle");
    const silent = fakeWorker();
    const again = requestPricesFromWorker(() => silent.worker, request);
    silent.fail("");
    await expect(again).rejects.toThrow("The price worker failed: it did not start");
    expect(w.terminated() + silent.terminated()).toBe(2);
  });

  it("rejects a reply it cannot read", async () => {
    const w = fakeWorker();
    const pending = requestPricesFromWorker(() => w.worker, request);
    w.garble();
    await expect(pending).rejects.toThrow("The price worker's reply could not be read");
    expect(w.terminated()).toBe(1);
  });

  it("is what the data source uses when given a worker, with the snapshot's price ids", async () => {
    const up = await fakeUpstream();
    const w = fakeWorker();
    const source = createBuilderDataSource({
      snapshotUrl: SNAPSHOT_URL,
      itemsUrl: ITEMS_URL,
      fetchImpl: up.fetchImpl,
      createPriceWorker: () => w.worker,
    });
    const pending = source.prices();
    await vi.waitFor(() => expect(w.sent).toHaveLength(1));
    expect(w.sent[0]?.itemsUrl).toBe(ITEMS_URL);
    expect(w.sent[0]?.ids.length).toBeGreaterThan(0);
    w.reply({ ok: true, prices });
    expect(await pending).toEqual(prices);
    // The main thread never asked upstream itself.
    expect(up.calls).toEqual([SNAPSHOT_URL]);
  });
});
