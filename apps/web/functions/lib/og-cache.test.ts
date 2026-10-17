import { describe, expect, it } from "vitest";
import { ogCacheKey } from "./og-cache.js";

describe("ogCacheKey", () => {
  it("drops the query string and fragment, keeping origin and path", () => {
    expect(ogCacheKey("https://site.pages.dev/og/build/abcd2345?x=1#y").url).toBe(
      "https://site.pages.dev/og/build/abcd2345",
    );
  });

  it("gives two URLs that differ only in their query string the same key", () => {
    const a = ogCacheKey("https://site.pages.dev/og/pair/efgh6789?cpu=1");
    const b = ogCacheKey("https://site.pages.dev/og/pair/efgh6789?cpu=2&z");
    expect(a.url).toBe(b.url);
    expect(a.method).toBe("GET");
  });

  it("keeps different paths apart", () => {
    expect(ogCacheKey("https://site.pages.dev/og/build/abcd2345").url).not.toBe(
      ogCacheKey("https://site.pages.dev/og/build/abcd2346").url,
    );
  });
});
