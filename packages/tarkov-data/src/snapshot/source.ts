import {
  fetchPriceTable,
  PriceFetchError,
  type LivePrices,
  type PriceReply,
  type PriceRequest,
} from "../prices/fetch.js";
import { parseBuilderSnapshot } from "./load.js";
import type { BuilderPrices, BuilderSnapshot } from "./types.js";
import { snapshotPriceIds } from "./views.js";

/** Where the Builder's hooks get game data and prices from. */
export interface BuilderDataSource {
  /** The build-time snapshot. Loaded once per page. */
  snapshot(): Promise<BuilderSnapshot>;
  /** Live prices for every id the snapshot's offers depend on, and their age. */
  prices(): Promise<LivePrices>;
}

/** The part of a `Worker` the price transport uses; a real `Worker` is one. */
export type PriceWorker = Pick<
  Worker,
  "postMessage" | "terminate" | "onmessage" | "onerror" | "onmessageerror"
>;

export interface BuilderDataSourceOptions {
  /** Where the snapshot is served, e.g. `/data/builder-snapshot.json`. */
  readonly snapshotUrl: string;
  /** The raw upstream items document prices are read from. */
  readonly itemsUrl: string;
  readonly fetchImpl?: typeof fetch;
  /** How long a price table is reused before it is fetched again. */
  readonly priceTtlMs?: number;
  /**
   * Starts the price Web Worker (`apps/web/src/prices.worker.ts`). Left out where `Worker`
   * does not exist — tests, Node — and the prices are then fetched on the calling thread.
   */
  readonly createPriceWorker?: () => PriceWorker;
}

/**
 * Ask a fresh price worker for one table, then terminate it: the parsed items document lives
 * only in the worker, and terminating it frees it at once.
 *
 * A worker that fails to start, or whose reply cannot be read, rejects rather than falling
 * back to the main thread: a broken worker bundle must show, not hide behind a slower page.
 */
export function requestPricesFromWorker(
  createWorker: () => PriceWorker,
  request: PriceRequest,
): Promise<LivePrices> {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    worker.onmessage = (event: MessageEvent<PriceReply>) => {
      worker.terminate();
      const reply = event.data;
      if (reply.ok) resolve(reply.prices);
      else reject(new PriceFetchError(reply.message));
    };
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(
        new PriceFetchError(`The price worker failed: ${event.message || "it did not start"}`),
      );
    };
    worker.onmessageerror = () => {
      worker.terminate();
      reject(new PriceFetchError("The price worker's reply could not be read"));
    };
    worker.postMessage(request);
  });
}

/**
 * The SPA's data source.
 *
 * The snapshot comes from the site itself. Prices come from upstream's `items` document,
 * fetched without its `_en` translations — no price field is translated — and reduced to a
 * price table for the snapshot's ids: in a Web Worker when one is given, so the 17 MB parse
 * never runs on the main thread.
 *
 * A rejection is never cached, so a failed load retries on the next request instead of
 * sticking for the life of the page.
 */
export function createBuilderDataSource(options: BuilderDataSourceOptions): BuilderDataSource {
  const { snapshotUrl, itemsUrl, fetchImpl, priceTtlMs = 3_600_000, createPriceWorker } = options;
  const doFetch: typeof fetch = (input, init) =>
    fetchImpl !== undefined ? fetchImpl(input, init) : fetch(input, init);

  let snapshotPromise: Promise<BuilderSnapshot> | undefined;
  let priceEntry: { at: number; promise: Promise<LivePrices> } | undefined;

  const snapshot = (): Promise<BuilderSnapshot> => {
    if (snapshotPromise !== undefined) return snapshotPromise;
    const promise = (async () => {
      const response = await doFetch(snapshotUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error(`Failed to load game data: ${response.status} ${response.statusText}`);
      }
      return parseBuilderSnapshot(await response.json());
    })();
    promise.catch(() => {
      snapshotPromise = undefined;
    });
    snapshotPromise = promise;
    return promise;
  };

  const prices = (): Promise<LivePrices> => {
    const now = Date.now();
    if (priceEntry !== undefined && now - priceEntry.at < priceTtlMs) return priceEntry.promise;
    const promise = (async () => {
      const request: PriceRequest = { itemsUrl, ids: snapshotPriceIds(await snapshot()) };
      return createPriceWorker !== undefined
        ? requestPricesFromWorker(createPriceWorker, request)
        : fetchPriceTable(request, { fetchImpl: doFetch });
    })();
    const entry = { at: now, promise };
    promise.catch(() => {
      if (priceEntry === entry) priceEntry = undefined;
    });
    priceEntry = entry;
    return promise;
  };

  return { snapshot, prices };
}

/** A data source over values already in hand — tests, and tools that built a snapshot. */
export function staticBuilderDataSource(
  snapshot: BuilderSnapshot,
  prices: BuilderPrices,
): BuilderDataSource {
  const live: LivePrices = { table: prices.prices, asOf: prices.dataAsOf };
  return { snapshot: () => Promise.resolve(snapshot), prices: () => Promise.resolve(live) };
}
