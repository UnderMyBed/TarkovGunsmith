import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureSnapshot } from "../__test-utils__/fixture-snapshot.js";
import { TarkovApiError } from "../client.js";
import itemsCapture from "../__fixtures__/items-sample.json" with { type: "json" };
import { createBuilderDataSource, staticBuilderDataSource } from "./source.js";

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

afterEach(() => vi.unstubAllGlobals());

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
    expect(await source.prices()).toEqual(up.prices.prices);
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
    await expect(source.prices()).rejects.toBeInstanceOf(TarkovApiError);
    up.setItems({ data: {} });
    await expect(source.prices()).rejects.toThrow("The items document has no data.items map");
    up.setItems(null);
    await expect(source.prices()).rejects.toThrow("no data.items map");
    up.setItems(itemsCapture.document);
    expect(await source.prices()).toEqual(up.prices.prices);
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
    expect(await newer).toEqual(up.prices.prices);
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
    const source = staticBuilderDataSource(snapshot, prices.prices);
    expect(await source.snapshot()).toBe(snapshot);
    expect(await source.prices()).toBe(prices.prices);
  });
});
