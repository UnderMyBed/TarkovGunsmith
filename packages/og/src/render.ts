import satori, { type SatoriOptions } from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";

type SatoriFont = NonNullable<SatoriOptions["fonts"]>[number];

let resvgReady: Promise<void> | null = null;

/**
 * Explicitly initialize resvg-wasm with a WebAssembly.Module or ArrayBuffer.
 * Use from Cloudflare Pages Functions, where the wasm binary is imported
 * by the bundler as a module binding. Idempotent — safe to call many times.
 */
export async function initResvg(
  wasm: WebAssembly.Module | ArrayBuffer | Uint8Array,
): Promise<void> {
  if (resvgReady) return resvgReady;
  resvgReady = (async () => {
    await initWasm(wasm);
  })();
  return resvgReady;
}

/**
 * Node-only fallback: resolve the wasm file via createRequire, read bytes,
 * pass to initWasm. The native wasm-ESM loader can't instantiate resvg-wasm
 * (its wbg imports aren't npm-resolvable). Memoized.
 */
async function ensureResvgReadyNode(): Promise<void> {
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
 *
 * In CF Pages Functions: call `initResvg(wasmModule)` once at Function
 * startup so `renderPng` skips the Node auto-init path.
 *
 * In Node (vitest, scripts): `renderPng` auto-initializes via `fs.readFile`.
 */
export async function renderPng(
  jsx: Parameters<typeof satori>[0],
  fonts: SatoriFont[],
  opts: RenderOptions,
): Promise<Uint8Array> {
  if (!resvgReady) {
    await ensureResvgReadyNode();
  } else {
    await resvgReady;
  }
  const svg = await satori(jsx, { width: opts.width, height: opts.height, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: opts.width } });
  return resvg.render().asPng();
}
