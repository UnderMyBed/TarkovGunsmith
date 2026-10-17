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
    expect(text).toMatch(/Build A/);
    expect(text).toMatch(/Build B/);
    expect(text).toMatch(/M4A1/);
    expect(text).toMatch(/HK 416A5/);
    expect(text).toMatch(/vs/);
    expect(text).toMatch(/Build comparison/);
    expect(text).toMatch(/Ergo/);
    expect(text).toMatch(/Recoil V/);
    expect(text).toMatch(/Recoil H/);
    expect(text).toMatch(/Weight/);
  });

  it("prints a side's availability after its part count, and only the count without one", async () => {
    const fonts = await loadFonts();
    const left = { ...pairSample.left!, modCount: 7, availability: "LL4 barter · Flea" };
    const right = { ...pairSample.right!, modCount: 9, availability: null };
    const text = textContent(await renderSvg(pairCard({ left, right }), fonts));
    expect(text).toMatch(/7 mods · LL4 barter · Flea/);
    expect(text).toMatch(/9 mods/);
    expect(text).not.toMatch(/9 mods ·/);
  });

  it("renders Empty slot for a missing side", async () => {
    const fonts = await loadFonts();
    const svg = await renderSvg(pairCard(pairOneSided), fonts);
    const text = textContent(svg);
    expect(text).toMatch(/Empty slot/);
    expect(text).toMatch(/M4A1/);
  });

  it('renders "—" instead of "NaN" for a NaN stat', async () => {
    // A `Number.isNaN` value is a valid `number` at the type level (e.g. an upstream 0/0),
    // and the card's `fmt()` helper guards it. No hydrator path in this package produces one
    // today, so it's constructed directly.
    const fonts = await loadFonts();
    const vm: PairCardViewModel = {
      left: {
        weapon: "M4A1",
        modCount: 3,
        availability: "Flea",
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
