import { describe, expect, it } from "vitest";
import { scrubUrls, stripUrlQueries } from "./scrub.js";

describe("stripUrlQueries", () => {
  it("drops query strings and fragments from every URL in a string", () => {
    expect(
      stripUrlQueries(
        "Failed to fetch https://tarkovtracker.io/api/v2/progress?token=x#y and http://a.b/c?d=1",
      ),
    ).toBe("Failed to fetch https://tarkovtracker.io/api/v2/progress and http://a.b/c");
  });

  it("leaves a URL without a query alone", () => {
    expect(stripUrlQueries("https://tarkovgunsmith.undermybed.dev/builder/abc")).toBe(
      "https://tarkovgunsmith.undermybed.dev/builder/abc",
    );
  });
});

describe("scrubUrls", () => {
  it("scrubs page URLs, event attributes and stack frames at any depth", () => {
    const item = {
      type: "event",
      payload: {
        name: "faro.navigation",
        attributes: { fromUrl: "https://x.dev/builder?view=optimize", toUrl: "https://x.dev/" },
        stacktrace: { frames: [{ filename: "https://x.dev/assets/a.js?v=1", lineno: 3 }] },
      },
      meta: { page: { url: "https://x.dev/builder/abc?view=optimize#top" }, session: { id: "s" } },
    };
    expect(scrubUrls(item)).toEqual({
      type: "event",
      payload: {
        name: "faro.navigation",
        attributes: { fromUrl: "https://x.dev/builder", toUrl: "https://x.dev/" },
        stacktrace: { frames: [{ filename: "https://x.dev/assets/a.js", lineno: 3 }] },
      },
      meta: { page: { url: "https://x.dev/builder/abc" }, session: { id: "s" } },
    });
  });
});
