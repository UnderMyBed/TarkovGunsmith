import { mergeTranslations } from "./translations.js";
import type { TranslatedDocument } from "./translations.js";

/** Thrown when an upstream resource cannot be fetched. */
export class TarkovApiError extends Error {
  override name = "TarkovApiError";
  constructor(
    message: string,
    readonly resource: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface TarkovJsonClient {
  /** Fetch one resource with its `_en` translations already merged in. */
  fetchResource<T>(resource: string): Promise<T>;
}

interface CacheEntry {
  at: number;
  promise: Promise<unknown>;
}

/**
 * Construct a client for the json.tarkov.dev API.
 *
 * Resources are cached for `ttlMs`, because six query modules read the same items
 * document and it is 1.36 MB gzipped. Caching here rather than in the hooks keeps every
 * `fetchX(client)` signature unchanged.
 *
 * @param baseUrl - Base including game mode and trailing slash, e.g.
 *                  `https://json.tarkov.dev/regular/`.
 * @param fetchImpl - Optional fetch implementation (defaults to global fetch).
 * @param ttlMs - Cache lifetime. Upstream regenerates roughly daily.
 */
export function createTarkovClient(
  baseUrl: string,
  fetchImpl?: typeof fetch,
  ttlMs = 3_600_000,
): TarkovJsonClient {
  // Resolved per call rather than captured at construction: a module-scope client would
  // otherwise pin whatever `fetch` existed at import time, which breaks test doubles and any
  // runtime that installs its own fetch after module evaluation.
  const doFetch: typeof fetch = (input, init) =>
    fetchImpl !== undefined ? fetchImpl(input, init) : fetch(input, init);
  const cache = new Map<string, CacheEntry>();

  async function getJson(resource: string, required: boolean): Promise<unknown> {
    const response = await doFetch(`${baseUrl}${resource}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (!required) return undefined;
      throw new TarkovApiError(
        `Failed to fetch ${resource}: ${response.status} ${response.statusText}`,
        resource,
        response.status,
      );
    }
    return response.json();
  }

  return {
    fetchResource<T>(resource: string): Promise<T> {
      const now = Date.now();
      const hit = cache.get(resource);
      if (hit !== undefined && now - hit.at < ttlMs) return hit.promise as Promise<T>;

      const promise = (async () => {
        // The translation document is optional: a missing one leaves keys in place rather
        // than failing a request that already has perfectly good data.
        const [raw, lang] = await Promise.all([
          getJson(resource, true),
          getJson(`${resource}_en`, false).catch(() => undefined),
        ]);
        const doc = raw as TranslatedDocument<T>;
        const langData = (lang as { data?: Record<string, string> } | undefined)?.data ?? {};
        return mergeTranslations(doc, langData);
      })();

      // Never cache a rejection: an upstream blip would otherwise poison the client for a
      // full TTL, turning a transient outage into a lasting one.
      promise.catch(() => cache.delete(resource));
      cache.set(resource, { at: now, promise });
      return promise;
    },
  };
}

export type { TranslatedDocument };
