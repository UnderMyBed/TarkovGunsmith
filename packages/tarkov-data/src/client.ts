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
 * @param options.requireTranslations - Fail a resource whose `_en` document cannot be fetched,
 *   instead of leaving every text field as its translation key. The snapshot generator sets
 *   this: a release built while `items_en` is down would otherwise ship a Builder of keys.
 */
export function createTarkovClient(
  baseUrl: string,
  fetchImpl?: typeof fetch,
  ttlMs = 3_600_000,
  options: { readonly requireTranslations?: boolean } = {},
): TarkovJsonClient {
  const requireTranslations = options.requireTranslations ?? false;
  // Resolved per call rather than captured at construction: a module-scope client would
  // otherwise pin whatever `fetch` existed at import time, which breaks test doubles and any
  // runtime that installs its own fetch after module evaluation.
  const doFetch: typeof fetch = (input, init) =>
    fetchImpl !== undefined ? fetchImpl(input, init) : fetch(input, init);
  const cache = new Map<string, CacheEntry>();

  async function getJson(resource: string): Promise<unknown> {
    const response = await doFetch(`${baseUrl}${resource}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new TarkovApiError(
        `Failed to fetch ${resource}: ${response.status} ${response.statusText}`,
        resource,
        response.status,
      );
    }
    return response.json();
  }

  /** The `_en` lookup table, or why there is none. */
  async function getLang(
    resource: string,
  ): Promise<{ data: Record<string, string> } | { error: unknown }> {
    try {
      const body = (await getJson(`${resource}_en`)) as { data?: unknown } | null;
      const data = body?.data;
      if (data === null || typeof data !== "object" || Array.isArray(data)) {
        return { error: new Error("its body has no `data` object") };
      }
      if (Object.keys(data).length === 0) return { error: new Error("its `data` is empty") };
      return { data: data as Record<string, string> };
    } catch (error) {
      return { error };
    }
  }

  return {
    fetchResource<T>(resource: string): Promise<T> {
      const now = Date.now();
      const hit = cache.get(resource);
      if (hit !== undefined && now - hit.at < ttlMs) return hit.promise as Promise<T>;

      const promise = (async () => {
        // The translation document is optional unless required: a missing one leaves keys in
        // place rather than failing a request that already has perfectly good data.
        const [raw, lang] = await Promise.all([getJson(resource), getLang(resource)]);
        const doc = raw as TranslatedDocument<T>;
        // Required only where there is something to translate: upstream serves no `_en` for a
        // document that lists no translation paths (`barters`).
        if ("error" in lang && requireTranslations && (doc.translations?.length ?? 0) > 0) {
          const cause = lang.error;
          throw new TarkovApiError(
            `${resource}_en, which ${resource} needs for its text, is unusable: ${
              cause instanceof Error ? cause.message : String(cause)
            }`,
            `${resource}_en`,
            // The HTTP status when there was one; 0 for a network failure or a malformed body.
            cause instanceof TarkovApiError ? cause.status : 0,
          );
        }
        const langData = "data" in lang ? lang.data : {};
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
