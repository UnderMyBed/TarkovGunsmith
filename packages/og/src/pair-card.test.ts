import { describe, expect, it } from "vitest";
import { pairCard } from "./pair-card.js";
import { loadFonts } from "./fonts.js";
import { pairSample, pairOneSided } from "./__fixtures__/pair-sample.js";
import { renderSvg, textContent } from "./__test-utils__/svg.js";
import type { PairCardViewModel } from "./view-model.js";

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

  it('renders "—" instead of "NaN" for a NaN stat', async () => {
    // `stats.*` is typed `number | null`, not `number | null | undefined` — a
    // `Number.isNaN` value is a valid `number` at the type level (e.g. an upstream
    // 0/0), and the card's `fmt()` helper guards it the same way it guards `null`. No
    // hydrator path in this package produces one today, so it's constructed directly.
    const fonts = await loadFonts();
    const vm: PairCardViewModel = {
      left: {
        weapon: "M4A1",
        modCount: 3,
        availability: "FLEA",
        stats: { ergo: NaN, recoilV: 60, recoilH: 300, weight: 1.2 },
      },
      right: null,
    };
    const svg = await renderSvg(pairCard(vm), fonts);
    const text = textContent(svg);
    expect(text).toContain("—");
    expect(text).not.toMatch(/NaN/);
  });
});
