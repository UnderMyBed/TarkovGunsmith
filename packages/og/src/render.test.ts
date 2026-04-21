import { describe, expect, it } from "vitest";
import { renderPng } from "./render.js";
import { loadFonts } from "./fonts.js";

describe("renderPng", () => {
  it("produces a PNG from a trivial JSX tree", async () => {
    const fonts = await loadFonts();
    const jsx = {
      type: "div",
      props: {
        style: {
          width: 100,
          height: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000",
          color: "#fff",
          fontFamily: "Chivo",
          fontSize: 16,
        },
        children: "hi",
      },
    };
    const png = await renderPng(jsx, fonts, { width: 100, height: 50 });
    expect(png.byteLength).toBeGreaterThan(100);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  }, 20_000);
});
