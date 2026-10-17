import { TarkovApiError } from "../client.js";
import { extractPrices, type PriceTable } from "../queries/shared/buy-for.js";
import { parseBuilderSnapshot } from "./load.js";
import type { BuilderSnapshot } from "./types.js";
import { snapshotPriceIds } from "./views.js";

/** Where the Builder's hooks get game data and prices from. */
export interface BuilderDataSource {
  /** The build-time snapshot. Loaded once per page. */
  snapshot(): Promise<BuilderSnapshot>;
  /** Live prices for every id the snapshot's offers depend on. */
  prices(): Promise<PriceTable>;
}

export interface BuilderDataSourceOptions {
  /** Where the snapshot is served, e.g. `/data/builder-snapshot.json`. */
  readonly snapshotUrl: string;
  /** The raw upstream items document prices are read from. */
  readonly itemsUrl: string;
  readonly fetchImpl?: typeof fetch;
  /** How long a price table is reused. Upstream regenerates roughly daily. */
  readonly priceTtlMs?: number;
}

/**
 * The SPA's data source.
 *
 * The snapshot comes from the site itself. Prices come from upstream's `items` document,
 * fetched without its `_en` translations — no price field is translated — and reduced to a
 * {@link PriceTable} for the snapshot's ids. Issue #212 moves that fetch into a Web Worker.
 *
 * A rejection is never cached, so a failed load retries on the next request instead of
 * sticking for the life of the page.
 */
export function createBuilderDataSource(options: BuilderDataSourceOptions): BuilderDataSource {
  const { snapshotUrl, itemsUrl, fetchImpl, priceTtlMs = 3_600_000 } = options;
  const doFetch: typeof fetch = (input, init) =>
    fetchImpl !== undefined ? fetchImpl(input, init) : fetch(input, init);

  let snapshotPromise: Promise<BuilderSnapshot> | undefined;
  let priceEntry: { at: number; promise: Promise<PriceTable> } | undefined;

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

  const prices = (): Promise<PriceTable> => {
    const now = Date.now();
    if (priceEntry !== undefined && now - priceEntry.at < priceTtlMs) return priceEntry.promise;
    const promise = (async () => {
      const snap = await snapshot();
      const response = await doFetch(itemsUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new TarkovApiError(
          `Failed to fetch items: ${response.status} ${response.statusText}`,
          "items",
          response.status,
        );
      }
      const doc = (await response.json()) as { data?: { items?: unknown } } | null;
      const items = doc?.data?.items;
      if (items === null || typeof items !== "object") {
        throw new Error("The items document has no data.items map");
      }
      const byId = items as Record<string, unknown>;
      return extractPrices((id) => byId[id], snapshotPriceIds(snap)).table;
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
  prices: PriceTable,
): BuilderDataSource {
  return { snapshot: () => Promise.resolve(snapshot), prices: () => Promise.resolve(prices) };
}
