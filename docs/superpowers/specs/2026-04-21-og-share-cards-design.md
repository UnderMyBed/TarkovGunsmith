# OG share cards — design

**Status:** approved 2026-04-21
**Milestone:** M3 differentiator #4 (of 5).
**Ships:** PR-sized in two stages (pure package, then Pages Functions + middleware).

## 1. Goal

When a shareable build URL (`/builder/:id`) or comparison URL (`/builder/compare/:pairId`) is pasted into Discord, Twitter, Slack, or any Open Graph-aware surface, the link unfurls as a rich 1200×630 PNG preview that communicates the build at a glance — weapon, key stats, progression gate, and the TarkovGunsmith brand.

Today these URLs have no OG tags and unfurl as plain text.

## 2. Scope

In scope (this spec):

- Two new Pages Functions: `/og/build/:id` and `/og/pair/:pairId`, each returning a 1200×630 PNG.
- One middleware: inject OG / Twitter meta tags into the SPA's `index.html` on `/builder/:id` and `/builder/compare/:pairId` responses.
- A new pure-TS workspace package `packages/og` that owns the card JSX, font-loading, render pipeline, and fixtures.
- A small startup hook in `apps/builds-api` that seeds a known OG test build + pair into KV when `OG_FIXTURE_BUILD_ID` / `OG_FIXTURE_PAIR_ID` env vars are set (test + dev only; never set in prod).

Non-goals:

- Custom card backgrounds or user uploads.
- Animated / video previews.
- Bitmap elements on the card (no weapon icons in v1 — satori's raster path is fragile).
- OG cards for `/sim`, `/matrix`, or `/charts` scenario/permalink URLs. Follow-up once these routes have share URLs.
- Share-copy UI changes. The `Share build` button keeps emitting the same URLs; OG injection is invisible to that code path.
- Rate limiting. Cache-friendly endpoint + CF DDOS protection is sufficient for v1.

## 3. Architecture

Two routes and one middleware on the existing `apps/web` Pages project:

```
GET  /og/build/:id       → 1200×630 PNG (build card, layout C)
GET  /og/pair/:pairId    → 1200×630 PNG (pair card, layout A)

apps/web/functions/_middleware.ts
  — intercepts /builder/:id and /builder/compare/:pairId only
  — fetches entity, rewrites index.html to inject OG meta
  — passes everything else untouched
```

New package:

```
packages/og
  src/build-card.tsx             JSX for build card (layout C)
  src/pair-card.tsx              JSX for pair card (layout A)
  src/fonts.ts                   ArrayBuffer loader for Bungee / Chivo / Azeret Mono
  src/render.ts                  satori → SVG → resvg → PNG pipeline
  src/colors.ts                  Field Ledger palette constants
  src/hydrate.ts                 BuildV4 + GraphQL lookups → view-model for the card
  src/truncate.ts                headline truncation helpers
  src/__fixtures__/              frozen BuildV4 + pair inputs for snapshot tests
  scripts/build-fallback-png.ts  one-off Node script: regenerate fallback-card.png
  assets/fallback-card.png       pre-rendered static PNG, served on KV-miss / render error
  fonts/*.ttf                    font files (~355 KB)
  fonts/README.md                Google Fonts source URL + download date
```

New dependencies in `apps/web` (bundled into Pages Functions):

- `satori` — HTML/JSX → SVG (~400 KB minified).
- `@resvg/resvg-wasm` — SVG → PNG via wasm (~900 KB).

Runtime location: **Pages Function, not a dedicated Worker.** Same deploy pipeline, same `BUILDS_API_URL` env var, lower-latency intra-Pages calls. Upgrade to a separate Worker only if OG volume starts threatening SPA CPU budgets.

## 4. Card layouts

### 4.1 Build card (layout C — metadata-rich)

Canvas: 1200×630, background `#0e0f0c`, grain overlay 5% opacity (radial-gradient-dot SVG), amber corner brackets (40×40px, 4px stroke, amber `#f59e0b`).

Elements (scaled from the mockup at `.superpowers/brainstorm/**/build-card-layouts.html`):

- **Top-right `SHAREABLE` stamp.** Azeret Mono 22px, amber `#f59e0b`, letter-spacing 0.15em, uppercase.
- **Headline.** `BuildV4.name` if non-empty, else weapon short-name. Bungee 72px, paper `#e6e4db`, uppercase. Max 22 chars; longer names truncate with `…`.
- **Sub-headline** (only if `BuildV4.name` is set). Weapon short-name, Chivo 24px, paper-dim `#9a988d`.
- **Pill row** (Azeret Mono 22px, 8×20px padding, 1.5px border, uppercase):
  - _Availability pill_ (amber): `FLEA`, `LL2`, `LL3`, or `LL4` — the lowest trader level the build can be fully assembled at under the build's `profileSnapshot` (if set) or a default "flea + LL4" profile (if unset). If any mod only exists on flea, the pill is `FLEA`.
  - _Mod-count pill_ (paper): `{n} MODS`.
  - _Price pill_ (paper): `₽ {total.toLocaleString()}`. Emitted only when every mod has `buyFor` data; omitted otherwise (no partial totals).
- **5-column stat grid** at the bottom, dashed top border `#3a3d33`:
  - Columns: ERGO / RECOIL V / RECOIL H / WEIGHT / ACCURACY.
  - Label: Azeret Mono 20px paper-dim.
  - Value: Azeret Mono 44px / 700 paper. Missing data → `—`.
- **Bottom-left brand.** `▲ TARKOVGUNSMITH · SHARED BUILD`. Azeret Mono 24px. `TARKOVGUNSMITH` amber, rest paper-dim.

### 4.2 Pair card (layout A — mirror split)

Same background, grain, and brackets.

- **`LEFT` / `RIGHT` tags** top-left / top-right. Azeret Mono 20px paper-dim, letter-spacing 0.2em.
- **Vertical divider** at x=600, paper-dim `#3a3d33`, inset 100px top / 100px bottom.
- **Center `VS` circle.** 84×84px, 4px amber border, Bungee 32px amber, warm-black fill. Sits on top of the divider.
- **Per side** (50% wide, 24px/72px padding):
  - `BUILD A` / `BUILD B` label (Azeret Mono 20px paper-dim, letter-spacing 0.2em).
  - Weapon short-name: Bungee 48px, left side paper, right side amber. Single-line truncate.
  - Sub: `{n} MODS · {availability-pill-text}`. Azeret Mono 22px paper-dim.
  - 4-row stat table: ERGO / RECOIL V / RECOIL H / WEIGHT. Azeret Mono 26px. Label paper-dim 22px, value paper 700. Dashed bottom border per row.
- **Bottom-center brand.** `▲ TARKOVGUNSMITH · BUILD COMPARISON`.

### 4.3 Missing-data rules

- Any missing stat → `—` placeholder in mono.
- One-sided pair (user saved only left or right): that half renders `EMPTY SLOT` label + greyed stats; pair still renders.
- Missing weapon short-name (upstream data drift): fall back to weapon ID.
- No `BuildV4.description` surfaces on either card; the SPA exposes it inline. Cards prioritize stats at a glance.

### 4.4 Fallback card

A static PNG committed to the repo at `packages/og/assets/fallback-card.png`. Same brackets + palette as the live cards. Headline `BUILD NOT FOUND` (Bungee), subtitle `link expired or never existed` (Chivo). No live rendering at request time; the Function imports the bytes and returns them directly.

The PNG is generated once at ship-time by `packages/og/scripts/build-fallback-png.ts` (a small Node script that reuses `render.ts` against a hard-coded view-model). The script runs manually when the design changes and commits its output; it is not part of the CI pipeline.

Served on KV-miss (404) and on any satori / resvg exception mid-render.

## 5. Data flow

### 5.1 Build card request (`GET /og/build/:id`)

1. Check edge cache (`caches.default`) by request URL. Hit → return.
2. Miss → `fetch(BUILDS_API_URL + "/builds/" + id)`.
   - 404 → fallback card, `Cache-Control: public, max-age=3600` (re-check hourly; a build might be saved to that id later). Not put into edge cache.
   - 5xx → fallback card, `Cache-Control: no-store`.
   - 200 → parse as `BuildV4`.
3. **Hydrate** via one GraphQL roundtrip to `https://api.tarkov.dev/graphql` (server-to-server, no CORS issue; bypasses the SPA's `data-proxy` cache which is client-oriented):
   ```graphql
   query OgCardBuild($weaponId: ID!, $modIds: [ID!]!) {
     weapon: item(id: $weaponId) {
       id
       shortName
       properties {
         ... on ItemPropertiesWeapon {
           ergonomics
           recoilVertical
           recoilHorizontal
           accuracy
         }
       }
     }
     mods: items(ids: $modIds) {
       id
       shortName
       weight
       buyFor {
         vendor {
           normalizedName
         }
         priceRUB
       }
       properties {
         ... on ItemPropertiesWeaponMod {
           ergonomics
           recoilModifier
           accuracyModifier
         }
       }
     }
   }
   ```
4. Compute derived stats via `@tarkov/ballistics` `weaponSpec()` — same pure function the SPA uses, so numbers match.
5. Compute availability pill text via `@tarkov/data` `itemAvailability()` over `{ mods, profile }`, picking the lowest trader level that covers every mod; degrade to `FLEA` if any mod is flea-only.
6. Compute total price — sum of the lowest `buyFor.priceRUB` per mod. Omitted if any mod is missing `buyFor`.
7. Pass the hydrated view-model into `build-card.tsx` (JSX for satori), render via `packages/og/src/render.ts`:
   ```ts
   const svg = await satori(jsx, { width: 1200, height: 630, fonts });
   const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
   ```
8. Build the response: `content-type: image/png`, `cache-control: public, max-age=2592000, immutable` (30 days), `cdn-cache-control` same.
9. `caches.default.put(request, response.clone())`.
10. Return.

### 5.2 Pair card request (`GET /og/pair/:pairId`)

Identical, except:

- Fetches `BUILDS_API_URL + "/pairs/" + pairId`.
- Hydrates both sides in parallel (`Promise.all` over two GraphQL calls). An empty side (`null`) is passed as-is to the card.
- Renders `pair-card.tsx`.

### 5.3 Meta-tag middleware (`/builder/:id`, `/builder/compare/:pairId`)

Implemented with Cloudflare's `HTMLRewriter` in `apps/web/functions/_middleware.ts`:

1. Match request path against the two patterns. No match → `return next()`.
2. Fetch the SPA `index.html` via `next()` and the entity from `BUILDS_API_URL` in parallel.
3. If the entity fetch fails (404 or 5xx), return the `index.html` untouched — the SPA still loads, just without a rich preview.
4. Otherwise, stream-rewrite the `<head>` to append:
   ```html
   <meta property="og:type" content="article" />
   <meta property="og:title" content="{title}" />
   <meta property="og:description" content="{desc}" />
   <meta property="og:image" content="{origin}/og/build/{id}" />
   <meta property="og:image:width" content="1200" />
   <meta property="og:image:height" content="630" />
   <meta name="twitter:card" content="summary_large_image" />
   <meta name="twitter:image" content="{origin}/og/build/{id}" />
   ```
5. Title = `BuildV4.name` or weapon short-name; description = `BuildV4.description` or a canned summary (`"{shortName} build — N mods, shared via TarkovGunsmith."`). Same substitutions for pairs.

Uses `HTMLRewriter` (CF-Pages-native) — zero-copy streaming, no template engine.

## 6. Fonts

Ship font files as bundle assets so satori has `ArrayBuffer`s at render time — Google Fonts fetch-at-runtime is unreliable in Workers.

| File                 | Weight | Purpose                   | Size    |
| -------------------- | ------ | ------------------------- | ------- |
| `Bungee-Regular.ttf` | 400    | Display headlines         | ~140 KB |
| `Chivo-700.ttf`      | 700    | Sub-headlines             | ~65 KB  |
| `AzeretMono-500.ttf` | 500    | Stat labels, pills, brand | ~75 KB  |
| `AzeretMono-700.ttf` | 700    | Stat values               | ~75 KB  |

Total ~355 KB. Download from Google Fonts at the same version the SPA loads (resolve the `.ttf` URLs from the response of `fonts.googleapis.com/css2?family=Bungee&family=Chivo:...&family=Azeret+Mono:...`) and commit the files to `packages/og/fonts/`. `packages/og/fonts/README.md` records the source URLs + download date so future maintainers can re-fetch deterministically. Pin to the commit; no auto-update.

`packages/og/src/fonts.ts` exposes `loadFonts(): Promise<FontLoad[]>` that reads each `.ttf` via `fetch(new URL("../fonts/...", import.meta.url))` — CF Pages supports this pattern for static assets co-located with a Function. Cached per isolate.

## 7. Testing

### 7.1 `packages/og` unit tests (vitest)

- **`build-card.test.ts`** — renders the card to an SVG string (skip resvg — slow + wasm-heavy). Snapshot on a frozen `BuildV4` fixture. Assert key strings appear as `<text>` nodes: weapon name, stat labels, pill text, amber hex, Bungee / Azeret font-family literals.
- **`pair-card.test.ts`** — same, with a two-sided fixture and a one-sided ("empty slot") fixture.
- **`render.test.ts`** — end-to-end satori + resvg on a tiny JSX tree. Assert the returned `Uint8Array` begins with PNG magic bytes (`89 50 4E 47`). One test; proves the pipeline works in Node's wasm runtime.
- **`truncate.test.ts`** — headline truncation (empty / exactly-at-limit / over-limit cases).
- **`hydrate.test.ts`** — `BuildV4` + weapon/mod fixtures → view-model. Pure unit, no network.

### 7.2 Integration tests (`apps/web/e2e/smoke.spec.ts`)

Extend the existing suite:

- **`GET /og/build/<seeded-id>`** → 200, `content-type: image/png`, body > 5 KB. Playwright `request` API, no browser.
- **`GET /og/pair/<seeded-id>`** → same.
- **`GET /og/build/<invalid-id>`** → 200, `content-type: image/png` (fallback). Body-byte-equals the static fallback PNG.
- **`GET /builder/<seeded-id>`** → HTML contains `<meta property="og:image"` and `<meta name="twitter:card"`.
- **`GET /builder/compare/<seeded-pair-id>`** → same with the pair OG image URL.

### 7.3 Fixture seeding

Extend `apps/builds-api` with a startup fixture-seed gated by an env var:

```
OG_FIXTURE_BUILD_ID=ogfix001
OG_FIXTURE_PAIR_ID=ogfix002
```

On Worker startup in test mode, if these are set and the keys aren't populated, write a known M4A1 `BuildV4` under `b:ogfix001` and a pair wrapping it under `p:ogfix002`. Playwright's preview server already proxies to the dev builds-api; the OG routes pick them up naturally.

No pixel-snapshot testing — satori output shifts with wasm versions and is brittle. Add Playwright pixel snapshots later if the aesthetic keeps drifting.

## 8. Deployment + ops

- **Env vars:** zero new ones. `BUILDS_API_URL` is already set on Pages prod (existing `/api/builds` proxy uses it). Local dev via `.dev.vars`.
- **Bundle budget:** satori (~400 KB) + resvg-wasm (~900 KB) + fonts (~355 KB) = ~1.65 MB compressed. Workers free tier is 10 MB uncompressed per script; Pages Functions share that. 17% of budget.
- **Cold-start:** target < 500 ms first render per isolate (load satori + wasm + fonts). If we overshoot, add a `wrangler.toml` `keep-warm` cron (free-tier eligible) or lazy-import on the render path.
- **Caching:** edge cache TTL matches build TTL (30 days / `BUILD_TTL_SECONDS`). Missing-entity fallback cached 1 h.
- **Logging:** one `console.log` per render — `{ route, id, status, renderMs, cacheStatus }`. Tail via `wrangler pages deployment tail`. No external observability.
- **Rate limiting:** none in v1.

## 9. Rollout

Two PRs:

1. **`feat/og-package`** — ships `packages/og` + unit tests + fonts. Nothing wired into `apps/web` yet. Pure-TS; fully unit-testable; deployable no-op.
2. **`feat/og-functions`** — ships `apps/web/functions/og/build/[id].ts`, `apps/web/functions/og/pair/[pairId].ts`, `apps/web/functions/_middleware.ts`, new smoke fixtures + tests. Activates the endpoints.

Post-merge: drop a test `/builder/:id` link into Discord; verify the unfurl by eye.

## 10. Risks + open questions

- **`@resvg/resvg-wasm` in CF Workers runtime.** Community reports say it works in Pages Functions; I haven't verified first-hand. Mitigation: PR 1's `render.test.ts` proves it works in Node wasm (same wasm binary CF uses). If CF-side blocks on something isolate-specific, fallback is `satori-html` + server-side Playwright rasterization (~3× the cost but known-working).
- **Font licensing.** Bungee, Chivo, and Azeret Mono are all OFL 1.1 (Google Fonts). Bundling `.ttf` files in a repo is compatible with OFL — no action needed.
- **GraphQL rate limiting.** `api.tarkov.dev` is a community endpoint with no published rate limits. First-hit-per-id goes through once per 30 days (cached thereafter). Unlikely to be a problem. Mitigation: route OG renders through the `data-proxy` Worker if we ever hit limits.
- **`profileSnapshot` absence.** When `BuildV4.profileSnapshot` is unset (which is most builds — the SPA default is opt-in), the availability pill uses a "flea + LL4" default. This matches how `/builder` renders the same build today for a viewer with no profile loaded, so the pill text is consistent across surfaces.

## 11. References

- Mockup source (Field Ledger): `.superpowers/brainstorm/*/content/build-card-layouts.html` (`data-choice="c"`) and `.../pair-card-layouts.html` (`data-choice="a"`).
- Field Ledger tokens: `packages/ui/src/styles/index.css`.
- Build schema: `packages/tarkov-data/src/build-schema.ts` (v4).
- Pair schema: §11 of `docs/superpowers/specs/2026-04-20-build-comparison-design.md`.
- Builds-api: `apps/builds-api/src/index.ts`, `apps/builds-api/src/pairs.ts`.
- satori: https://github.com/vercel/satori
- `@resvg/resvg-wasm`: https://github.com/yisibl/resvg-js
- Cloudflare `HTMLRewriter`: https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/
