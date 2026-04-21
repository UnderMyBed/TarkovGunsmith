/**
 * Cloudflare Pages Function — renders the Open Graph share card PNG for a
 * saved build pair at `/og/pair/:pairId`.
 *
 * Mirrors `/og/build/:id` but hydrates both sides in parallel. Either side
 * may be null (single-sided pair) — `hydratePairCard` tolerates that. The
 * upstream Worker returns a `BuildPairV1` JSON body with `left`/`right`
 * each potentially `null`.
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
  type HydrateWeapon,
} from "@tarkov/og";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { type BuildV4, DEFAULT_PROFILE } from "@tarkov/data";
import { fetchOgRowsForBuild, type OgMod } from "../../lib/og-graphql.js";
import { availabilityPillText } from "../../lib/og-availability.js";

export interface Env {
  BUILDS_API_URL: string;
}

interface PairRecord {
  v: 1;
  left: BuildV4 | null;
  right: BuildV4 | null;
  createdAt: string;
}

const HEADERS_PNG = {
  "content-type": "image/png",
  "cache-control": "public, max-age=2592000, immutable",
} as const;

const HEADERS_FALLBACK = {
  "content-type": "image/png",
  "cache-control": "public, max-age=3600",
} as const;

/**
 * Local alias — same shape as `HydrateBuildArgs` but preserves `OgMod[]`
 * (the intersection of `HydrateMod` and `AvailabilityMod`) so the call to
 * `availabilityPillText` below stays type-safe. `hydratePairCard` widens
 * to `HydrateMod[]` internally, which is fine.
 */
interface SideArgs {
  build: BuildV4;
  weapon: HydrateWeapon;
  mods: OgMod[];
}

async function hydrateSide(build: BuildV4 | null): Promise<SideArgs | null> {
  if (!build) return null;
  const rows = await fetchOgRowsForBuild({
    weaponId: build.weaponId,
    modIds: Object.values(build.attachments),
  });
  return { build, weapon: rows.weapon, mods: rows.mods };
}

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const id = String(params.pairId ?? "");
  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const startedAt = Date.now();
  try {
    await initResvg(resvgWasm);

    const upstream = await fetch(`${env.BUILDS_API_URL}/pairs/${id}`);
    if (upstream.status === 404) return fallback("miss", id, startedAt);
    if (!upstream.ok) return fallback("upstream", id, startedAt, { "cache-control": "no-store" });

    // `fetch().json()` is `Promise<any>` under the lib.dom typings; cast is
    // load-bearing for downstream narrowing even though the rule thinks it's
    // a no-op (same pattern as apps/web/functions/lib/og-graphql.ts).
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const pair = (await upstream.json()) as PairRecord;
    const [leftArgs, rightArgs] = await Promise.all([
      hydrateSide(pair.left),
      hydrateSide(pair.right),
    ]);
    const vm = hydratePairCard({ left: leftArgs, right: rightArgs });

    if (vm.left && leftArgs) {
      vm.left.availability = availabilityPillText(
        leftArgs.mods,
        pair.left?.profileSnapshot ?? DEFAULT_PROFILE,
      );
    }
    if (vm.right && rightArgs) {
      vm.right.availability = availabilityPillText(
        rightArgs.mods,
        pair.right?.profileSnapshot ?? DEFAULT_PROFILE,
      );
    }

    const png = await renderPng(pairCard(vm), embeddedFonts(), { width: 1200, height: 630 });
    const body = new Uint8Array(png);
    const res = new Response(body, { status: 200, headers: HEADERS_PNG });
    console.log(JSON.stringify({ route: "og/pair", id, status: 200, ms: Date.now() - startedAt }));
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
