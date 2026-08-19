import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBytes, fontsFromBytes } from "./fonts.js";

// `loadFonts()` itself is exercised end-to-end (real `.ttf` files off disk, real
// memoization) by render.test.ts, since every card render needs it. These tests cover
// the two paths `loadFonts()` can never reach in a Node test process:
//  - `loadBytes`'s `fetch` branch — `loadFonts()` always builds a `file:` URL under Node,
//    so the CF-Pages-Functions `http(s):` path is only reachable by calling `loadBytes`
//    directly with a non-`file:` URL (see fonts.ts's comment on the export).
//  - `fontsFromBytes` — the synchronous, bundler-supplied alternative to `loadFonts()`,
//    never called by anything else in this package today (Phase 2 CF wiring will call it).

afterEach(() => vi.unstubAllGlobals());

describe("loadBytes", () => {
  it("fetches a non-file: URL and returns its bytes when the response is ok", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(bytes),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const url = new URL("https://assets.example.test/fonts/Bungee-Regular.ttf");
    const result = await loadBytes(url);

    expect(fetchSpy).toHaveBeenCalledWith(url);
    expect(result).toBe(bytes);
  });

  it("throws with the URL and status when the response is not ok", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchSpy);

    const url = new URL("https://assets.example.test/fonts/missing.ttf");
    await expect(loadBytes(url)).rejects.toThrow(
      "loadFonts: https://assets.example.test/fonts/missing.ttf → 404",
    );
  });
});

describe("fontsFromBytes", () => {
  it("builds satori's four-entry font list, preserving the supplied byte data", () => {
    const bungee400 = new Uint8Array([1]).buffer;
    const chivo700 = new Uint8Array([2]).buffer;
    // Uint8Array directly (not `.buffer`-sliced), the Cloudflare-bundler-import shape
    // fontsFromBytes's doc comment says callers should be able to pass as-is.
    const azeretMono500 = new Uint8Array([3]);
    const azeretMono700 = new Uint8Array([4]);

    const fonts = fontsFromBytes({ bungee400, chivo700, azeretMono500, azeretMono700 });

    expect(fonts).toEqual([
      { name: "Bungee", weight: 400, style: "normal", data: bungee400 },
      { name: "Chivo", weight: 700, style: "normal", data: chivo700 },
      { name: "Azeret Mono", weight: 500, style: "normal", data: azeretMono500 },
      { name: "Azeret Mono", weight: 700, style: "normal", data: azeretMono700 },
    ]);
  });
});
