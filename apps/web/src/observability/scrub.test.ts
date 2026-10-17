import { describe, expect, it } from "vitest";
import { scrubText, scrubUrls } from "./scrub.js";

const SITE = "https://tarkovgunsmith.undermybed.dev";

describe("scrubText", () => {
  it("drops query strings and fragments from every URL in a string", () => {
    expect(
      scrubText(
        "Failed to fetch https://tarkovtracker.io/api/v2/progress?token=x#y and http://a.b/c?d=1",
      ),
    ).toBe("Failed to fetch https://tarkovtracker.io/api/v2/progress and http://a.b/c");
  });

  it.each([
    [`${SITE}/builder/AbC123xy`, `${SITE}/builder/:id`],
    [`${SITE}/builder/AbC123xy?view=optimize`, `${SITE}/builder/:id`],
    [`${SITE}/builder/compare/PaIr9876`, `${SITE}/builder/compare/:pairId`],
    [`${SITE}/builder/compare/PaIr9876#top`, `${SITE}/builder/compare/:pairId`],
    [`${SITE}/builder/compare`, `${SITE}/builder/compare`],
    [`${SITE}/builder/compare?x=1`, `${SITE}/builder/compare`],
    [`${SITE}/builder`, `${SITE}/builder`],
    [`${SITE}/`, `${SITE}/`],
    [`${SITE}`, `${SITE}`],
    [`${SITE}/assets/index-abc.js`, `${SITE}/assets/index-abc.js`],
  ])("sends %s as %s", (url, sent) => {
    expect(scrubText(url)).toBe(sent);
  });

  it("templates ids inside longer text too", () => {
    expect(scrubText(`loaded ${SITE}/builder/AbC123xy, then left`)).toBe(
      `loaded ${SITE}/builder/:id, then left`,
    );
  });
});

describe("scrubUrls", () => {
  it("scrubs page URLs, navigation and view attributes and stack frames at any depth", () => {
    const item = {
      type: "event",
      payload: {
        name: "faro.navigation",
        attributes: {
          fromUrl: `${SITE}/builder/AbC123xy?view=optimize`,
          toUrl: `${SITE}/builder/compare/PaIr9876`,
        },
        stacktrace: { frames: [{ filename: `${SITE}/assets/a.js?v=1`, lineno: 3 }] },
      },
      meta: {
        page: { url: `${SITE}/builder/AbC123xy#top` },
        view: { name: "default" },
        session: { id: "s" },
      },
    };
    expect(scrubUrls(item)).toEqual({
      type: "event",
      payload: {
        name: "faro.navigation",
        attributes: {
          fromUrl: `${SITE}/builder/:id`,
          toUrl: `${SITE}/builder/compare/:pairId`,
        },
        stacktrace: { frames: [{ filename: `${SITE}/assets/a.js`, lineno: 3 }] },
      },
      meta: {
        page: { url: `${SITE}/builder/:id` },
        view: { name: "default" },
        session: { id: "s" },
      },
    });
  });
});
