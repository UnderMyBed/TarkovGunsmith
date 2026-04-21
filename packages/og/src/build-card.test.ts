import { describe, expect, it } from "vitest";
import satori from "satori";
import { buildCard } from "./build-card.js";
import { loadFonts } from "./fonts.js";
import type { BuildCardViewModel } from "./view-model.js";

const vm: BuildCardViewModel = {
  title: "RECOIL KING",
  subtitle: "M4A1",
  modCount: 11,
  availability: "LL3",
  priceRub: 187_240,
  stats: { ergo: 52, recoilV: 88, recoilH: 215, weight: 3.4, accuracy: 3.2 },
};

// `embedFont: false` makes satori emit literal `<text>` elements instead of
// rasterizing glyphs to `<path>`, so these snapshot-on-SVG tests can regex
// the rendered strings. Fonts still load (needed for metrics / layout).
async function render(model: BuildCardViewModel): Promise<string> {
  const fonts = await loadFonts();
  return satori(buildCard(model), { width: 1200, height: 630, fonts, embedFont: false });
}

/**
 * Satori splits multi-word strings into one `<text>` element per run and may
 * insert a whitespace-only element between them (e.g. "RECOIL KING" renders
 * as three sibling `<text>` nodes). Concatenate text content with a single
 * space so regexes like `/RECOIL KING/` match naturally.
 */
function textContent(svg: string): string {
  const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
  const parts: string[] = [];
  for (const [, inner] of svg.matchAll(re)) parts.push(inner);
  return parts.join(" ").replace(/\s+/g, " ");
}

describe("buildCard", () => {
  it("renders all view-model text into the SVG", async () => {
    const svg = await render(vm);
    const text = textContent(svg);
    expect(text).toMatch(/RECOIL KING/);
    expect(text).toMatch(/M4A1/);
    expect(text).toMatch(/11 MODS/);
    expect(text).toMatch(/LL3/);
    expect(text).toMatch(/SHAREABLE/);
    expect(text).toMatch(/ERGO/);
    expect(text).toMatch(/RECOIL V/);
    expect(text).toMatch(/RECOIL H/);
    expect(text).toMatch(/WEIGHT/);
    expect(text).toMatch(/ACCURACY/);
    expect(text).toMatch(/SHARED BUILD/);
    expect(text).toMatch(/TARKOVGUNSMITH/);
    expect(text).toMatch(/187 240|187,240/);
  });

  it("omits the price pill when priceRub is null", async () => {
    const svg = await render({ ...vm, priceRub: null });
    expect(svg).not.toMatch(/₽/);
  });

  it("omits the subtitle when build has no name (title already carries weapon)", async () => {
    const svg = await render({ ...vm, title: "M4A1", subtitle: null });
    const occurrences = (svg.match(/M4A1/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("renders — for missing stats", async () => {
    const svg = await render({
      ...vm,
      stats: { ergo: null, recoilV: null, recoilH: null, weight: null, accuracy: null },
    });
    expect(svg).toMatch(/—/);
  });
});
