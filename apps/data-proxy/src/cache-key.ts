export interface CacheKeyInput {
  readonly query: string;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly operationName?: string;
}

const CACHE_KEY_HOST = "https://tarkov-data-proxy.cache.local";

/**
 * Build a stable Cache API key URL for a GraphQL request. The Cache API
 * requires keys to be Request/URL objects; we encode the request shape as a
 * SHA-256 hex digest in the URL path so identical queries hash to the same
 * cache entry regardless of header ordering.
 */
export async function cacheKeyFor(input: CacheKeyInput): Promise<string> {
  const canonical = JSON.stringify({
    query: input.query,
    variables: input.variables,
    operationName: input.operationName ?? null,
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${CACHE_KEY_HOST}/${hex}`;
}
