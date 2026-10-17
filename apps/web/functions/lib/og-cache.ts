/**
 * The edge-cache key for a share card: the request's origin and path, without its query string.
 *
 * A card is a function of its path alone. Keying on the full URL let any `?x=N` miss the cache
 * and force a fresh render — about 250 ms of CPU in a new isolate, 60–90 ms in a warm one,
 * against the Workers Free 10 ms budget — and spend the daily request quota with it.
 */
export function ogCacheKey(requestUrl: string): Request {
  const { origin, pathname } = new URL(requestUrl);
  return new Request(`${origin}${pathname}`, { method: "GET" });
}
