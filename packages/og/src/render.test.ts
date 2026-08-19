import { describe, expect, it } from "vitest";
import { renderPng } from "./render.js";
import { loadFonts } from "./fonts.js";

function trivialJsx(children: string) {
  return {
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
      children,
    },
  };
}

describe("renderPng", () => {
  it("produces a PNG from a trivial JSX tree", async () => {
    const fonts = await loadFonts();
    const png = await renderPng(trivialJsx("hi"), fonts, { width: 100, height: 50 });
    expect(png.byteLength).toBeGreaterThan(100);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  }, 20_000);

  it("skips the Node auto-init on a later call once resvg is already ready", async () => {
    // The test above already drove this module's module-scoped `resvgReady` through
    // `ensureResvgReadyNode()`'s cold-start path and left it settled. This second call
    // exercises `renderPng`'s `else { await resvgReady; }` branch (render.ts:62) instead —
    // the path every render after the first per-isolate cold-start actually takes.
    const fonts = await loadFonts();
    const png = await renderPng(trivialJsx("again"), fonts, { width: 100, height: 50 });
    expect(png.byteLength).toBeGreaterThan(100);
  }, 20_000);
});

// `initResvg` itself — the explicit CF-Pages-Functions init entrypoint — is covered in
// render-init-resvg.test.ts, not here. It shares this module's `resvgReady` singleton
// with `ensureResvgReadyNode` above, and `@resvg/resvg-wasm`'s real `initWasm` can only
// run once per *process* ("Already initialized" — confirmed experimentally, not just
// from the doc comment), so it can't be exercised a second time in the same file as the
// real render above without either mocking it here (which would stop this file's
// renders from being real) or losing coverage of the auto-init path real `renderPng`
// calls take. See that file's header comment for the mocking approach used instead.
