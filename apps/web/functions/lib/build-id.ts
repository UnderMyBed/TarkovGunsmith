/**
 * The one place the Pages Functions tree defines what a build / pair id looks
 * like. Every handler that interpolates an id into a server-side `fetch` URL
 * validates it through `isValidBuildId` FIRST.
 *
 * Why this matters: `fetch(\`${env.BUILDS_API_URL}/builds/${id}\`)` is string
 * interpolation into a URL template, and the URL parser resolves dot segments
 * at parse time. An id of `../healthz` turns
 * `https://api.example.com/builds/../healthz` into
 * `https://api.example.com/healthz` — a different endpoint than the one the
 * code appears to request. Path params arrive percent-decoded, so `..%2F` in
 * the request line becomes a real `/` in `id`. Today the only reachable target
 * is our own read-only Worker, which bounds the impact; that bound is an
 * accident of deployment topology, not a property of this code, and it stops
 * holding the moment `BUILDS_API_URL` points somewhere else.
 *
 * MIRRORED CONTRACT — the source of truth is the generator in the Worker:
 *   apps/builds-api/src/id.ts:23  `BUILD_ID_REGEX`
 *   apps/builds-api/src/id.ts:4   `ALPHABET` (0/O/I/l/1 removed — URL-ambiguous)
 *   apps/builds-api/src/id.ts:5   `ID_LENGTH = 8`
 * The Worker rejects anything else with a 400 at `index.ts:65` (builds) and
 * `pairs.ts:68` (pairs), so an id that fails this test cannot address a real
 * record — validating here only ever turns a guaranteed-400 round trip into a
 * local rejection. Pair ids are produced by the same `newBuildId()` generator
 * (`apps/builds-api/src/pairs.ts:50,96`), so one rule covers both.
 *
 * If the generator's alphabet or length ever changes, this regex must change
 * with it, or freshly minted ids will 400 at the edge.
 */
export const BUILD_ID_REGEX = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

/**
 * True when `id` is a well-formed build or pair id.
 *
 * Rejects the empty string, wrong-length ids, ids outside the safe alphabet,
 * and — the reason this exists — anything carrying a path separator, a dot
 * segment, or a percent-encoded form of either.
 *
 * @example
 *   isValidBuildId("abcd2345");   // true
 *   isValidBuildId("../healthz"); // false
 */
export function isValidBuildId(id: string): boolean {
  return BUILD_ID_REGEX.test(id);
}
