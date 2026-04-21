import { describe, expect, it } from "vitest";
import { pairCard } from "./pair-card.js";
import { loadFonts } from "./fonts.js";
import { pairSample, pairOneSided } from "./__fixtures__/pair-sample.js";
import { renderSvg, textContent } from "./__test-utils__/svg.js";

describe("pairCard", () => {
  it("renders both sides + VS + weapon names", async () => {
    const fonts = await loadFonts();
    const svg = await renderSvg(pairCard(pairSample), fonts);
    const text = textContent(svg);
    expect(text).toMatch(/BUILD A/);
    expect(text).toMatch(/BUILD B/);
    expect(text).toMatch(/M4A1/);
    expect(text).toMatch(/HK 416A5/);
    expect(text).toMatch(/VS/);
    expect(text).toMatch(/BUILD COMPARISON/);
    expect(text).toMatch(/ERGO/);
    expect(text).toMatch(/RECOIL V/);
    expect(text).toMatch(/RECOIL H/);
    expect(text).toMatch(/WEIGHT/);
  });

  it("renders EMPTY SLOT for a missing side", async () => {
    const fonts = await loadFonts();
    const svg = await renderSvg(pairCard(pairOneSided), fonts);
    const text = textContent(svg);
    expect(text).toMatch(/EMPTY SLOT/);
    expect(text).toMatch(/M4A1/);
  });
});
