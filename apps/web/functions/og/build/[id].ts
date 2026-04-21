/**
 * Cloudflare Pages Function — renders the Open Graph share card PNG for a
 * saved build at `/og/build/:id`.
 *
 * Flow:
 *   1. Check CF edge cache — return the cached PNG immediately on hit.
 *   2. `initResvg(wasmModule)` (idempotent across isolate).
 *   3. GET the build from the builds-api Worker; 404 → fallback PNG.
 *   4. Fetch GraphQL rows for the weapon + attached mods.
 *   5. Hydrate the view model, overwrite `availability` with the
 *      trader-level summary computed from the actual `buyFor` offers.
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
import { type BuildV4, DEFAULT_PROFILE } from "@tarkov/data";
import { fetchOgRowsForBuild } from "../../lib/og-graphql.js";
import { availabilityPillText } from "../../lib/og-availability.js";

export interface Env {
  BUILDS_API_URL: string;
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
  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const startedAt = Date.now();
  try {
    await initResvg(resvgWasm);

    const upstream = await fetch(`${env.BUILDS_API_URL}/builds/${id}`);
    if (upstream.status === 404) {
      return fallback("miss", id, startedAt);
    }
    if (!upstream.ok) {
      return fallback("upstream", id, startedAt, { "cache-control": "no-store" });
    }

    const build = (await upstream.json()) as BuildV4;
    const rows = await fetchOgRowsForBuild({
      weaponId: build.weaponId,
      modIds: Object.values(build.attachments),
    });
    const vm = hydrateBuildCard({ build, weapon: rows.weapon, mods: rows.mods });
    vm.availability = availabilityPillText(
      rows.mods,
      build.profileSnapshot ?? DEFAULT_PROFILE,
    );

    const png = await renderPng(buildCard(vm), embeddedFonts(), { width: 1200, height: 630 });
    const body = new Uint8Array(png);
    const res = new Response(body, { status: 200, headers: HEADERS_PNG });
    console.log(
      JSON.stringify({ route: "og/build", id, status: 200, ms: Date.now() - startedAt }),
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
