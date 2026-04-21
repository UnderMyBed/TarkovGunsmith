import type { SatoriOptions } from "satori";

type SatoriFont = NonNullable<SatoriOptions["fonts"]>[number];

const FONT_FILES: readonly { path: string; name: string; weight: 400 | 500 | 700 }[] = [
  { path: "../fonts/Bungee-Regular.ttf", name: "Bungee", weight: 400 },
  { path: "../fonts/Chivo-700.ttf", name: "Chivo", weight: 700 },
  { path: "../fonts/AzeretMono-500.ttf", name: "Azeret Mono", weight: 500 },
  { path: "../fonts/AzeretMono-700.ttf", name: "Azeret Mono", weight: 700 },
];

let cached: SatoriFont[] | null = null;

/**
 * Load the four `.ttf` files this package ships and return them in satori's
 * `fonts` option shape. Memoized per isolate.
 *
 * Works in both Node (vitest, scripts) and Cloudflare Pages Functions: the
 * `new URL("../fonts/...", import.meta.url)` pattern resolves to a real URL
 * in both environments, and `fetch()` handles `file://` in Node and the
 * co-located static asset in CF Pages.
 */
export async function loadFonts(): Promise<SatoriFont[]> {
  if (cached) return cached;
  const fonts = await Promise.all(
    FONT_FILES.map(async ({ path, name, weight }) => {
      const url = new URL(path, import.meta.url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`loadFonts: ${url.toString()} → ${res.status}`);
      const data = await res.arrayBuffer();
      return { name, weight, style: "normal", data } satisfies SatoriFont;
    }),
  );
  cached = fonts;
  return fonts;
}
