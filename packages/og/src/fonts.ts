import type { SatoriOptions } from "satori";

type SatoriFont = NonNullable<SatoriOptions["fonts"]>[number];

const FONT_FILES: readonly { path: string; name: string; weight: 400 | 500 | 700 }[] = [
  { path: "../fonts/Bungee-Regular.ttf", name: "Bungee", weight: 400 },
  { path: "../fonts/Chivo-700.ttf", name: "Chivo", weight: 700 },
  { path: "../fonts/AzeretMono-500.ttf", name: "Azeret Mono", weight: 500 },
  { path: "../fonts/AzeretMono-700.ttf", name: "Azeret Mono", weight: 700 },
];

let cached: SatoriFont[] | null = null;

async function loadBytes(url: URL): Promise<ArrayBuffer> {
  if (url.protocol === "file:") {
    const { readFile } = await import("node:fs/promises");
    const buf = await readFile(url);
    // Return a tight ArrayBuffer slice so satori doesn't see the Node Buffer header.
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`loadFonts: ${url.toString()} → ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Load the four `.ttf` files this package ships and return them in satori's
 * `fonts` option shape. Memoized per isolate.
 *
 * In Node (vitest, scripts): reads from disk via `fs/promises`.
 * In Cloudflare Pages Functions: fetches over the co-located static asset
 * URL (Phase 2 consumers may need to seed this differently if the runtime
 * disallows `file:` URLs in import.meta.url resolution).
 */
export async function loadFonts(): Promise<SatoriFont[]> {
  if (cached) return cached;
  const fonts = await Promise.all(
    FONT_FILES.map(async ({ path, name, weight }) => {
      const url = new URL(path, import.meta.url);
      const data = await loadBytes(url);
      return { name, weight, style: "normal", data } satisfies SatoriFont;
    }),
  );
  cached = fonts;
  return fonts;
}

/**
 * Synchronous font-bundle constructor. Use from Cloudflare Pages Functions
 * (or any environment that imports font bytes directly via a bundler rule)
 * to skip the filesystem-based `loadFonts()` entirely.
 */
export interface FontBytes {
  bungee400: ArrayBuffer | Uint8Array;
  chivo700: ArrayBuffer | Uint8Array;
  azeretMono500: ArrayBuffer | Uint8Array;
  azeretMono700: ArrayBuffer | Uint8Array;
}

export function fontsFromBytes(bytes: FontBytes): SatoriFont[] {
  // Satori's types declare `data: ArrayBuffer | Buffer` but its runtime
  // accepts any typed array (it ends up in @resvg/resvg-js' FFI which
  // normalizes). Cast via `unknown` so callers can pass Uint8Array directly
  // without having to `.buffer`-slice at every call site.
  const asData = (b: ArrayBuffer | Uint8Array): ArrayBuffer => b as unknown as ArrayBuffer;
  return [
    { name: "Bungee", weight: 400, style: "normal", data: asData(bytes.bungee400) },
    { name: "Chivo", weight: 700, style: "normal", data: asData(bytes.chivo700) },
    { name: "Azeret Mono", weight: 500, style: "normal", data: asData(bytes.azeretMono500) },
    { name: "Azeret Mono", weight: 700, style: "normal", data: asData(bytes.azeretMono700) },
  ];
}
