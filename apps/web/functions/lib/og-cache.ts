// The repo's release version: release-please bumps it in the root package.json on every
// release, and a release merge is the only thing that deploys (`.github/workflows/deploy.yml`).
// The Pages bundler inlines it, so it costs nothing at request time.
import { version } from "../../../../package.json";

/** The release this deploy was built from, e.g. `1.19.0`. */
export const OG_RELEASE: string = version;

/**
 * The edge-cache key for a share card: the request's origin and path, under the release that
 * drew it, without the request's query string.
 *
 * - The query string is left out because a card is a function of its path alone. Keying on the
 *   full URL let any `?x=N` miss the cache and force a fresh render — about 250 ms of CPU in a
 *   new isolate, 60–90 ms in a warm one, against the Workers Free 10 ms budget — and spend the
 *   daily request quota with it.
 * - The release is put in because a card is cached for 30 days as immutable, and a release can
 *   change what a card draws: its stats code, or the snapshot and prices it reads. Without it,
 *   a card drawn by the previous release would be served until it expired. The key is internal
 *   to the cache; the `og:image` URL a page links to carries no release and no query.
 *
 * @param release - The release identifier; {@link OG_RELEASE} in the handlers.
 */
export function ogCacheKey(requestUrl: string, release: string = OG_RELEASE): Request {
  const { origin, pathname } = new URL(requestUrl);
  const key = new URL(`${origin}${pathname}`);
  key.searchParams.set("release", release);
  return new Request(key.href, { method: "GET" });
}
