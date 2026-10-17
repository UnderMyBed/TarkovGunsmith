/**
 * Cloudflare Pages Function — renders the Open Graph share card PNG for a
 * saved build pair at `/og/pair/:pairId`.
 *
 * Mirrors `/og/build/:id` but hydrates both sides. Either side
 * may be null (single-sided pair) — `hydratePairCard` tolerates that. The
 * upstream Worker returns a stored `BuildPair`; each side, of any build version,
 * is loaded as the Compare page loads it (`loadStoredPair`).
 *
 * Note on asset loading: see `/og/build/[id].ts` — fonts + fallback PNG come
 * from `@tarkov/og`'s `embeddedFonts()` / `embeddedFallbackPng()` helpers
 * (base64-embedded literals decoded at module-load time).
 */
import {
  embeddedFallbackPng,
  embeddedFonts,
  hydratePairCard,
  initResvg,
  pairCard,
  renderPng,
  type HydrateSideArgs,
} from "@tarkov/og";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import {
  fetchOgRowsForBuild,
  loadOgData,
  loadStoredPair,
  type OgData,
  type StoredPairSide,
} from "../../lib/og-graphql.js";
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

function hydrateSide(side: StoredPairSide | null, data: OgData): HydrateSideArgs | null {
  if (!side) return null;
  const rows = fetchOgRowsForBuild(
    {
      weaponId: side.build.weaponId,
      attachments: side.build.attachments,
      // The side's own profile, as the Compare page prices and gates it; the pair card prints
      // no price, but its availability pill is drawn under this gate.
      gate: side.profile ?? null,
    },
    data,
  );
  return {
    name: side.build.name,
    weapon: rows.weapon,
    mods: rows.mods,
    availability: rows.availability,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = String(params.pairId ?? "");
  // Same guard as /og/build/:id — reject before the id reaches the
  // `${env.BUILDS_API_URL}/pairs/${id}` template below. Pair ids come from the
  // same generator as build ids (apps/builds-api/src/pairs.ts:50), so the same
  // rule applies.
  if (!isValidBuildId(id)) return invalidId(id);

  const cache = caches.default;
  const cacheKey = ogCacheKey(request.url);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const startedAt = Date.now();
  try {
    await initResvg(resvgWasm);

    const upstream = await fetch(`${buildsApiBase(env)}/pairs/${id}`);
    if (upstream.status === 404) return fallback("miss", id, startedAt);
    if (!upstream.ok) return fallback("upstream", id, startedAt, { "cache-control": "no-store" });

    const raw: unknown = await upstream.json();
    const dataStartedAt = Date.now();
    const data = await loadOgData(env.ASSETS, request.url);
    const dataMs = Date.now() - dataStartedAt;
    // Both sides, of any stored version, upgraded and checked as Compare opens them; a record
    // Compare would refuse throws into the fallback below, logged with its id.
    const pair = loadStoredPair(raw, data.snapshot);
    const left = hydrateSide(pair.left, data);
    const right = hydrateSide(pair.right, data);
    const vm = hydratePairCard({ left, right });

    const png = await renderPng(pairCard(vm), embeddedFonts(), { width: 1200, height: 630 });
    const body = new Uint8Array(png);
    const res = new Response(body, { status: 200, headers: HEADERS_PNG });
    console.log(
      JSON.stringify({ route: "og/pair", id, status: 200, ms: Date.now() - startedAt, dataMs }),
    );
    await cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    console.error(
      JSON.stringify({
        route: "og/pair",
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
 * response for the same condition (`apps/builds-api/src/pairs.ts:68` —
 * `"Invalid id"`, 400). The rejected id is not echoed into the log line; see
 * the note in `/og/build/[id].ts`.
 */
function invalidId(id: string): Response {
  console.log(
    JSON.stringify({ route: "og/pair", status: 400, kind: "invalid-id", len: id.length }),
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
      route: "og/pair",
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
