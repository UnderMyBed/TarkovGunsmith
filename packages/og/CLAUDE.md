# `@tarkov/og`

Server-side rendering of 1200×630 Open Graph card PNGs for TarkovGunsmith
share URLs. Pure-TS, runs in both Node and Cloudflare Workers — satori for
JSX → SVG, `@resvg/resvg-wasm` for SVG → PNG.

## What's in this package

- `src/build-card.tsx` — JSX for the build card (layout C).
- `src/pair-card.tsx` — JSX for the pair card (layout A — mirror split).
- `src/hydrate.ts` — `hydrateBuildCard` / `hydratePairCard` — pure view-model
  builders. Consumers fetch the GraphQL data and pass it in.
- `src/render.ts` — `renderPng(jsx, fonts, { width, height })`.
- `src/fonts.ts` — `loadFonts()` reads the bundled `.ttf` files.
- `src/colors.ts` — Field Ledger hex constants mirroring the SPA tokens.
- `src/truncate.ts` — single-line headline truncate with `…`.
- `src/__test-utils__/svg.ts` — shared test helpers: `renderSvg()` forces
  `embedFont: false` so text survives as `<text>` in the SVG; `textContent()`
  concatenates all `<text>` inner content so multi-word assertions work.
- `assets/fallback-card.png` — pre-rendered `BUILD NOT FOUND` card, served by
  the Pages Function on KV-miss / render failure.
- `fonts/` — the four `.ttf` files satori loads at render time.
- `scripts/build-fallback-png.tsx` — regenerate the fallback; run manually.

## Conventions

- **Satori supports inline styles only.** No className, no CSS. All layout is
  flex with absolute positioning. Every `<div>` with children needs an
  explicit `display` property (satori rejects divs that look like both a
  block and a text container).
- **Pure functions.** `hydrate.ts` takes rows, not GraphQL clients. The Pages
  Function does the fetch; this package never touches the network (except
  satori's font loads, which resolve locally via `fs` or `fetch`).
- **Field Ledger fidelity.** Colors and font names MUST match
  `packages/ui/src/styles/index.css`. If the SPA palette or `<link>` font
  stack changes, regenerate `assets/fallback-card.png` via
  `pnpm --filter @tarkov/og run build:fallback`.
- **No DOM.** This package runs in Workers; no `window`, no `document`.

## Testing notes

Satori defaults `embedFont: true`, which rasterizes all glyphs into `<path>`
elements — no literal text survives the SVG. Snapshot tests pass
`embedFont: false` via `renderSvg()` in `__test-utils__/svg.ts` so regexes
can match expected strings. Satori also emits one `<text>` element per
word-run, so multi-word assertions go through `textContent()` which
concatenates the inner content of all `<text>` nodes.

## Local dev

```bash
pnpm --filter @tarkov/og test           # vitest
pnpm --filter @tarkov/og build          # tsc
pnpm --filter @tarkov/og run build:fallback  # regenerate the fallback PNG
```

## Runtime notes

- First `renderPng()` call per Node / isolate pays a wasm init cost (~200 ms
  in Node, variable in CF Workers). Subsequent calls in the same isolate
  skip it.
- `loadFonts()` memoizes per-isolate; safe to call in a tight loop.
- Node wasm init uses `createRequire` + `fs.readFile` because Node's native
  wasm-ESM loader can't resolve resvg-wasm's `wbg` imports. Cloudflare Pages
  Functions will use a different bootstrap (Wrangler bundles the `.wasm` as
  a `WebAssembly.Module` binding); that wiring lives in `apps/web` when the
  Phase 2 PR lands.
