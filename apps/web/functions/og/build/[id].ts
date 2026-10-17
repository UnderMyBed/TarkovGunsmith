/**
 * Cloudflare Pages Function — renders the Open Graph share card PNG for a
 * saved build at `/og/build/:id`.
 *
 * Flow:
 *   1. Check CF edge cache (keyed on the path, not the query string) — return the cached PNG
 *      immediately on hit.
 *   2. `initResvg(wasmModule)` (idempotent across isolate).
 *   3. GET the build from the builds-api Worker; 404 → fallback PNG.
 *   4. Load the build-time snapshot and prices from the deploy's own assets (once per
 *      isolate), bring the stored build of any version to the current one as the Builder
 *      does (`loadStoredBuild`), and draw the weapon + mounted parts from them.
 *   5. Hydrate the view model: stats, price and availability pill all under the build's
 *      embedded profile, or theorycraft (every gate open) when it carries none.
 *   6. Render JSX → SVG → PNG at 1200×630.
 *   7. Cache & return with `public, max-age=30d, immutable`.
 *
 * Fallback path returns the pre-rendered `BUILD NOT FOUND` PNG with a short
 * max-age so a successful follow-up render can displace it.
 *
 * Note on asset loading: we use the `embeddedFonts()` / `embeddedFallbackPng()`
 * helpers from `@tarkov/og` — fonts + fallback PNG are base64-embedded as
 * string literals and decoded at module-load time. This sidesteps the CF
 * Pages bundler, which does NOT honor `[[rules]]` for `.png` / `.ttf` module
 * imports in wrangler 4.83.
 */
import {
  buildCard,
  embeddedFallbackPng,
  embeddedFonts,
  hydrateBuildCard,
  initResvg,
  renderPng,
} from "@tarkov/og";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { fetchOgRowsForBuild, loadOgData, loadStoredBuild } from "../../lib/og-graphql.js";
import { ogCacheKey } from "../../lib/og-cache.js";
import { isValidBuildId } from "../../lib/build-id.js";
import { buildsApiBase } from "../../lib/builds-api.js";

export interface Env {
  BUILDS_API_URL?: string;
  /** The deploy's static assets, which hold the build-time snapshot the card is drawn from. */
  ASSETS: Fetcher;
}

const HEADERS_PNG = {
  "content-type": "image/png",
  "cache-control": "public, max-age=2592000, immutable",
} as const;

const HEADERS_FALLBACK = {
  "content-type": "image/png",
  "cache-control": "public, max-age=3600",
} as const;

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = String(params.id ?? "");
  // Reject before the cache probe and before the id reaches the
  // `${env.BUILDS_API_URL}/builds/${id}` template below — see
  // functions/lib/build-id.ts for why interpolating an unvalidated id into a
  // URL is the bug. A malformed id can never name a real record (the Worker
  // 400s it), so this is a client error, not a missing build: it gets a 400
  // rather than the "BUILD NOT FOUND" fallback card, which stays reserved for
  // a well-formed id that has expired or never existed.
  if (!isValidBuildId(id)) return invalidId(id);

  const cache = caches.default;
  const cacheKey = ogCacheKey(request.url);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const startedAt = Date.now();
  try {
    await initResvg(resvgWasm);

    const upstream = await fetch(`${buildsApiBase(env)}/builds/${id}`);
    if (upstream.status === 404) {
      return fallback("miss", id, startedAt);
    }
    if (!upstream.ok) {
      return fallback("upstream", id, startedAt, { "cache-control": "no-store" });
    }

    const raw: unknown = await upstream.json();
    const dataStartedAt = Date.now();
    const data = await loadOgData(env.ASSETS, request.url);
    const dataMs = Date.now() - dataStartedAt;
    // Any stored version, upgraded and checked as the Builder opens it; a record the Builder
    // would refuse throws into the fallback below, logged with its id.
    const build = loadStoredBuild(raw, data.snapshot);
    const rows = fetchOgRowsForBuild(
      {
        weaponId: build.weaponId,
        attachments: build.attachments,
        // The author's profile when the build carries one, else the cheapest path anyone can use.
        gate: build.profileSnapshot ?? null,
      },
      data,
    );
    const vm = hydrateBuildCard({
      name: build.name,
      weapon: rows.weapon,
      priceRub: rows.priceRub,
      mods: rows.mods,
      availability: rows.availability,
    });

    const png = await renderPng(buildCard(vm), embeddedFonts(), { width: 1200, height: 630 });
    const body = new Uint8Array(png);
    const res = new Response(body, { status: 200, headers: HEADERS_PNG });
    console.log(
      JSON.stringify({ route: "og/build", id, status: 200, ms: Date.now() - startedAt, dataMs }),
    );
    await cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    console.error(
      JSON.stringify({
        route: "og/build",
        id,
        status: 500,
        ms: Date.now() - startedAt,
        err: String(err),
      }),
    );
    return fallback("error", id, startedAt, { "cache-control": "no-store" });
  }
};

/**
 * A malformed id is a client error. Mirrors the builds-api Worker's own
 * response for the same condition (`apps/builds-api/src/index.ts:65` —
 * `"Invalid id"`, 400) so the two tiers answer identically.
 *
 * The rejected id is NOT echoed into the log line: it is attacker-controlled
 * and unbounded, and this is the one path a scanner can hit at will. The
 * length is enough to tell a typo from a probe.
 */
function invalidId(id: string): Response {
  console.log(
    JSON.stringify({ route: "og/build", status: 400, kind: "invalid-id", len: id.length }),
  );
  return new Response("Invalid id", {
    status: 400,
    headers: { "content-type": "text/plain;charset=UTF-8", "cache-control": "no-store" },
  });
}

function fallback(
  kind: "miss" | "upstream" | "error",
  id: string,
  startedAt: number,
  extra: Record<string, string> = {},
): Response {
  console.log(
    JSON.stringify({
      route: "og/build",
      id,
      status: "fallback",
      kind,
      ms: Date.now() - startedAt,
    }),
  );
  // `embeddedFallbackPng()` returns a `Uint8Array`; cast through `BodyInit`
  // because the DOM lib.d.ts `BodyInit` union lacks `Uint8Array` even though
  // the runtime accepts it. (Workers types DO include it, but the DOM lib
  // wins here.)
  return new Response(embeddedFallbackPng() as unknown as BodyInit, {
    status: 200,
    headers: { ...HEADERS_FALLBACK, ...extra },
  });
}
