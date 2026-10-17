import { extractPrices, newestUpdated, type PriceTable } from "./table.js";

/** A price table and the age of the document it was read from. */
export interface LivePrices {
  readonly table: PriceTable;
  /** The newest `updated` timestamp in the items document (ISO 8601). */
  readonly asOf: string;
}

/** What the main thread asks the price worker for. */
export interface PriceRequest {
  /** The raw upstream items document, e.g. `https://json.tarkov.dev/regular/items`. */
  readonly itemsUrl: string;
  /** Every id the snapshot's offers depend on (`snapshotPriceIds`). */
  readonly ids: readonly string[];
}

/** What the price worker posts back: the prices, or why there are none. */
export type PriceReply =
  | { readonly ok: true; readonly prices: LivePrices }
  | { readonly ok: false; readonly message: string };

/** How long one request for the items document may take, body included. */
export const PRICE_TIMEOUT_MS = 60_000;

/** A cached items document older than this is fetched again. */
export const PRICE_MAX_AGE_MS = 3_600_000;

/** Thrown when live prices cannot be read; the message says why. */
export class PriceFetchError extends Error {
  override name = "PriceFetchError";
}

export interface FetchPricesOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxAgeMs?: number;
  /** The current time in ms. For tests. */
  readonly now?: () => number;
}

async function load(
  request: PriceRequest,
  cache: RequestCache,
  doFetch: typeof fetch,
  timeoutMs: number,
): Promise<LivePrices> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(request.itemsUrl, {
      cache,
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new PriceFetchError(
        `json.tarkov.dev answered ${response.status} ${response.statusText}`.trimEnd(),
      );
    }
    const doc = (await response.json()) as { data?: { items?: unknown } } | null;
    const items = doc?.data?.items;
    if (items === null || typeof items !== "object") {
      throw new PriceFetchError("The items document has no data.items map");
    }
    const byId = items as Record<string, unknown>;
    const asOf = newestUpdated(byId);
    if (asOf === null) throw new PriceFetchError("No item carries an `updated` timestamp");
    return { table: extractPrices((id) => byId[id], request.ids).table, asOf };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PriceFetchError(`Prices did not arrive within ${timeoutMs / 1000} s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the raw items document and read the prices of `request.ids` out of it.
 *
 * The first request lets the browser's HTTP cache answer. Upstream serves the document with
 * `cache-control: max-age=691200`, so a cached copy can be up to 8 days old: when its `asOf`
 * is older than `maxAgeMs`, the document is fetched again with `cache: "no-cache"`. A
 * conditional request rarely saves anything, because upstream regenerates `items` about
 * every 10 minutes (`Last-Modified` 01:40:30 then 01:50:29 on 2026-10-17, and the earlier
 * ETag drew a 200), so a cached copy younger than an hour is used as it is.
 *
 * If the fresh fetch fails, the cached copy is returned: its `asOf` is shown with the prices,
 * so their age stays visible. Any other failure rejects with a {@link PriceFetchError} or the
 * network error, and the caller treats every price as unknown.
 */
export async function fetchPriceTable(
  request: PriceRequest,
  options: FetchPricesOptions = {},
): Promise<LivePrices> {
  const {
    fetchImpl,
    timeoutMs = PRICE_TIMEOUT_MS,
    maxAgeMs = PRICE_MAX_AGE_MS,
    now = Date.now,
  } = options;
  const doFetch: typeof fetch = (input, init) =>
    fetchImpl !== undefined ? fetchImpl(input, init) : fetch(input, init);
  const cached = await load(request, "default", doFetch, timeoutMs);
  if (now() - Date.parse(cached.asOf) <= maxAgeMs) return cached;
  try {
    return await load(request, "no-cache", doFetch, timeoutMs);
  } catch {
    return cached;
  }
}

/**
 * Answer one {@link PriceRequest}: the price worker's whole job, kept here so it is tested
 * with everything else. Never rejects; a failure becomes `{ ok: false, message }`.
 */
export async function answerPriceRequest(
  request: PriceRequest,
  options: FetchPricesOptions = {},
): Promise<PriceReply> {
  try {
    return { ok: true, prices: await fetchPriceTable(request, options) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
