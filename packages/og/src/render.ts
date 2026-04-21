import satori, { type SatoriOptions } from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

type SatoriFont = NonNullable<SatoriOptions["fonts"]>[number];

let resvgReady: Promise<void> | null = null;

/**
 * Lazy-initialize the resvg wasm binary. Memoized per isolate; `initWasm()`
 * throws if called twice.
 *
 * Node path: resolve the wasm file via `createRequire`, read its bytes, pass
 * to `initWasm`. This is the form resvg-wasm expects in Node — the native
 * wasm-ESM loader can't instantiate this module because its wbg imports
 * aren't resolvable as an npm package.
 *
 * Cloudflare Pages Functions need a different path (Wrangler bundles the
 * `.wasm` as a `WebAssembly.Module` binding). Phase 2 owns that wiring; this
 * Node-only loader is enough for package unit tests.
 */
async function ensureResvgReady(): Promise<void> {
  if (resvgReady) return resvgReady;
  resvgReady = (async () => {
    const { createRequire } = await import("node:module");
    const { readFile } = await import("node:fs/promises");
    const req = createRequire(import.meta.url);
    const wasmPath = req.resolve("@resvg/resvg-wasm/index_bg.wasm");
    const bytes = await readFile(wasmPath);
    await initWasm(bytes);
  })();
  return resvgReady;
}

export interface RenderOptions {
  width: number;
  height: number;
}

/**
 * Render satori JSX → SVG → PNG. Cold start pays one wasm init per isolate.
 */
export async function renderPng(
  jsx: Parameters<typeof satori>[0],
  fonts: SatoriFont[],
  opts: RenderOptions,
): Promise<Uint8Array> {
  await ensureResvgReady();
  const svg = await satori(jsx, { width: opts.width, height: opts.height, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: opts.width } });
  return resvg.render().asPng();
}
