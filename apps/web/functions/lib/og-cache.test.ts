import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OG_RELEASE, ogCacheKey } from "./og-cache.js";

describe("ogCacheKey", () => {
  it("keys on origin, path and release, dropping the request's query string and fragment", () => {
    expect(ogCacheKey("https://site.pages.dev/og/build/abcd2345?x=1#y", "1.20.0").url).toBe(
      "https://site.pages.dev/og/build/abcd2345?release=1.20.0",
    );
  });

  it("gives two URLs that differ only in their query string the same key", () => {
    const a = ogCacheKey("https://site.pages.dev/og/pair/efgh6789?cpu=1", "1.20.0");
    const b = ogCacheKey("https://site.pages.dev/og/pair/efgh6789?cpu=2&release=9", "1.20.0");
    expect(a.url).toBe(b.url);
    expect(a.method).toBe("GET");
  });

  it("gives a card drawn by another release another key", () => {
    const url = "https://site.pages.dev/og/build/abcd2345";
    expect(ogCacheKey(url, "1.19.0").url).not.toBe(ogCacheKey(url, "1.20.0").url);
  });

  it("keeps different paths apart", () => {
    expect(ogCacheKey("https://site.pages.dev/og/build/abcd2345").url).not.toBe(
      ogCacheKey("https://site.pages.dev/og/build/abcd2346").url,
    );
  });

  it("defaults to the release in the root package.json, which release-please bumps", () => {
    const root = JSON.parse(
      readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(OG_RELEASE).toBe(root.version);
    expect(OG_RELEASE).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ogCacheKey("https://site.pages.dev/og/build/abcd2345").url).toBe(
      `https://site.pages.dev/og/build/abcd2345?release=${root.version}`,
    );
  });
});
