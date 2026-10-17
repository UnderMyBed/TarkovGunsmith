import { extractPrices, newestUpdated, type PriceTable } from "./table.js";

/** A price table and the age of the document it was read from. */
export interface LivePrices {
  readonly table: PriceTable;
  /** The newest `updated` timestamp in the items document (ISO 8601). */
  readonly asOf: string;
  /**
   * When the document was last fetched from upstream rather than the HTTP cache (ms), or
   * `null` when a cached copy was used whose fetch time is not known.
   */
  readonly fetchedAt: number | null;
}

/** What the main thread asks the price worker for. */
export interface PriceRequest {
  /** The raw upstream items document, e.g. `https://json.tarkov.dev/regular/items`. */
  readonly itemsUrl: string;
  /** Every id the snapshot's offers depend on (`snapshotPriceIds`). */
  readonly ids: readonly string[];
  /**
   * When the document was last fetched from upstream (`LivePrices.fetchedAt`), or `null` when
   * unknown. A cross-origin page cannot read the cached response's `Date` or `Age` (upstream
   * exposes neither), so the caller keeps this.
   */
  readonly lastFetchedAt: number | null;
}

/** What the price worker posts back: the prices, or why there are none. */
export type PriceReply =
  | { readonly ok: true; readonly prices: LivePrices }
  | { readonly ok: false; readonly message: string };

/** How long one request for the items document may take, body included. */
export const PRICE_TIMEOUT_MS = 60_000;

/** A copy of the items document fetched longer ago than this is fetched again. */
export const PRICE_MAX_AGE_MS = 3_600_000;

/**
 * How long the fallback to the HTTP cache may take. A cached copy answers at once; a fallback
 * that goes to the network after all must not keep the user waiting for a second full timeout.
 */
export const PRICE_FALLBACK_TIMEOUT_MS = 5_000;

/** Thrown when live prices cannot be read; the message says why. */
export class PriceFetchError extends Error {
  override name = "PriceFetchError";
}

/** Upstream did not answer within the timeout. */
class PriceTimeoutError extends PriceFetchError {}

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
): Promise<Omit<LivePrices, "fetchedAt">> {
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
      throw new PriceTimeoutError(`Prices did not arrive within ${timeoutMs / 1000} s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the raw items document and read the prices of `request.ids` out of it, in one request.
 *
 * Upstream serves the document with `cache-control: max-age=691200`, so the browser's HTTP
 * cache would answer with a copy up to 8 days old. When the copy was fetched within `maxAgeMs`
 * (`request.lastFetchedAt`), the cache is allowed to answer; otherwise the request goes out with
 * `cache: "no-cache"`. The decision rests on when the copy was fetched, not on the document's
 * own timestamps: a document upstream has stopped updating is fetched once an hour, not on
 * every load. A conditional request rarely saves anything either way, because upstream
 * regenerates `items` about every 10 minutes (`Last-Modified` 01:40:30 then 01:50:29 on
 * 2026-10-17, and the earlier ETag drew a 200).
 *
 * A `lastFetchedAt` in the future (a skewed clock, or a corrupt stored value) is treated as
 * unknown, so it cannot keep the cache answering until the clock catches up.
 *
 * If the `no-cache` request fails, whatever copy the HTTP cache holds is used (`force-cache`,
 * within {@link PRICE_FALLBACK_TIMEOUT_MS}): its `asOf` is shown with the prices, so their age
 * stays visible. After a timeout there is no fallback, since a second wait would follow the
 * first. When the fallback fails too, the `no-cache` request's own error is the one thrown: a
 * {@link PriceFetchError} or the network error, and the caller treats every price as unknown.
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
  const fetchedAt = now();
  const lastFetchedAt =
    request.lastFetchedAt !== null && request.lastFetchedAt <= fetchedAt
      ? request.lastFetchedAt
      : null;
  if (lastFetchedAt !== null && fetchedAt - lastFetchedAt <= maxAgeMs) {
    return { ...(await load(request, "default", doFetch, timeoutMs)), fetchedAt: lastFetchedAt };
  }
  try {
    return { ...(await load(request, "no-cache", doFetch, timeoutMs)), fetchedAt };
  } catch (error) {
    if (error instanceof PriceTimeoutError) throw error;
    // Upstream is unreachable or refused: the copy the cache holds, fetched at `lastFetchedAt`.
    try {
      const timeout = Math.min(timeoutMs, PRICE_FALLBACK_TIMEOUT_MS);
      return {
        ...(await load(request, "force-cache", doFetch, timeout)),
        fetchedAt: lastFetchedAt,
      };
    } catch {
      // The first failure is the one that says what is wrong with upstream.
      throw error;
    }
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
